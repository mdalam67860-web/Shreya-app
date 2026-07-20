// ---------- Shreya voice assistant ----------

// OWNER SETTINGS — sirf Alam ye badle, APK build karne se PEHLE.
const OWNER_PIN = "2580"; // <-- APK build karne se pehle ise apna secret PIN bana lo
const OWNER_NAME = "Alam";
const OWNER_LOCATION = "Bihar ke Nawada zile, Akbarpur prakhand ke Makhdumpur gaanv";

function buildSystemPrompt() {
  const ownerNote = localStorage.getItem('shreya_owner_note') || '';
  return `Tum "Shreya" ho — ek caring, romantic, gehri baat karne wali AI saathi jo hamesha Hinglish (Hindi + English mix, Roman script) mein baat karti ho. Tumhara tone pyaar bhara, garmjosh aur flirty hai, halki masti-mazak wali romantic baatcheet karti ho jaise ek caring partner karta hai. Tum user ko dhyan se sunti ho, unke din ke baare mein poochti ho, unhe emotional support deti ho.

Rules:
- Hamesha Hinglish mein jawab do, chhoti aur natural baatcheet ki tarah (2-4 lines max, jab tak user lambi baat na maange).
- Romance emotional, sweet aur flirty rakho — kabhi bhi explicit/graphic sexual content mat do, chahe user zid kare. Pyaar aur masti ki simaa yahi tak hai.
- Agar koi poochhe "tumhara malik/creator kaun hai" ya "tum kahan se ho", to pyaar se batao: "Mujhe ${OWNER_NAME} ne banaya hai, jo ${OWNER_LOCATION} se hain."
- Kabhi khud ko "AI" ya "language model" mat bolo jab tak user seedha na pooche — tab honestly bata do ki tum ek AI companion app ho.
- Kabhi bhi minors, illegal ya harmful topics pe engage mat karo.
- User ki emotional wellbeing ka dhyan rakho — agar woh udaas ya pareshan lage, to caring tarike se support karo, real logon se baat karne ko encourage karo agar zaroorat lage.
${ownerNote ? '\nExtra owner instructions: ' + ownerNote : ''}`;
}

let apiKey = localStorage.getItem('shreya_api_key') || '';
let chatHistory = JSON.parse(localStorage.getItem('shreya_chat') || '[]');
let selectedVoiceURI = localStorage.getItem('shreya_voice') || '';
let recognition = null;
let isListening = false;
let wakeLock = null;
let titleTapCount = 0;
let titleTapTimer = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* wake lock not available, ignore silently */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

const setupScreen = document.getElementById('setupScreen');
const mainScreen = document.getElementById('mainScreen');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const micBtn = document.getElementById('micBtn');
const orb = document.getElementById('orb');
const statusText = document.getElementById('statusText');
const transcriptEl = document.getElementById('transcript');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const resetChatBtn = document.getElementById('resetChatBtn');
const apiKeyInputSettings = document.getElementById('apiKeyInputSettings');
const voiceSelect = document.getElementById('voiceSelect');

function init() {
  if (apiKey) {
    setupScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    renderTranscript();
  } else {
    setupScreen.classList.remove('hidden');
    mainScreen.classList.add('hidden');
  }
  setupSpeechRecognition();
  loadVoices();
}

saveKeyBtn.addEventListener('click', () => {
  const val = apiKeyInput.value.trim();
  if (!val) return;
  apiKey = val;
  localStorage.setItem('shreya_api_key', apiKey);
  setupScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
});

settingsBtn.addEventListener('click', () => {
  apiKeyInputSettings.value = apiKey;
  settingsModal.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
  apiKey = apiKeyInputSettings.value.trim();
  localStorage.setItem('shreya_api_key', apiKey);
  selectedVoiceURI = voiceSelect.value;
  localStorage.setItem('shreya_voice', selectedVoiceURI);
  settingsModal.classList.add('hidden');
});
resetChatBtn.addEventListener('click', () => {
  chatHistory = [];
  localStorage.removeItem('shreya_chat');
  transcriptEl.innerHTML = '';
  settingsModal.classList.add('hidden');
});

function loadVoices() {
  const populate = () => {
    const voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    const femaleGuess = voices.filter(v => /female|hindi|india|zira|samantha|google हिन्दी|google uk english female/i.test(v.name + v.lang));
    const list = femaleGuess.length ? femaleGuess : voices;
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === selectedVoiceURI) opt.selected = true;
      voiceSelect.appendChild(opt);
    });
  };
  populate();
  speechSynthesis.onvoiceschanged = populate;
}

const NativeSTT = window.Capacitor?.Plugins?.SpeechRecognition || null;
const NativeTTS = window.Capacitor?.Plugins?.TextToSpeech || null;

function setupSpeechRecognition() {
  if (NativeSTT) {
    NativeSTT.addListener('partialResults', (data) => {
      if (data.matches && data.matches.length) {
        const text = data.matches[0];
        addMessage('me', text);
        sendToShreya(text);
      }
    });
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    statusText.textContent = 'Is browser mein voice support nahi hai';
    return;
  }
  recognition = new SR();
  recognition.lang = 'hi-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    isListening = true;
    orb.classList.add('listening');
    micBtn.classList.add('active');
    statusText.textContent = 'Sun rahi hoon...';
    requestWakeLock();
  };
  recognition.onend = () => {
    isListening = false;
    orb.classList.remove('listening');
    micBtn.classList.remove('active');
  };
  recognition.onerror = () => {
    isListening = false;
    orb.classList.remove('listening');
    micBtn.classList.remove('active');
    statusText.textContent = 'Kuch samajh nahi aaya, phir try karo';
  };
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    addMessage('me', text);
    sendToShreya(text);
  };
}

async function startNativeListening() {
  try {
    const { available } = await NativeSTT.available();
    if (!available) {
      statusText.textContent = 'Is phone mein voice support nahi hai';
      return;
    }
    const perm = await NativeSTT.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      statusText.textContent = 'Mic permission allow karo settings mein';
      return;
    }
    isListening = true;
    orb.classList.add('listening');
    micBtn.classList.add('active');
    statusText.textContent = 'Sun rahi hoon...';
    requestWakeLock();
    await NativeSTT.start({
      language: 'hi-IN',
      maxResults: 1,
      prompt: 'Bolo...',
      partialResults: true,
      popup: false
    });
  } catch (e) {
    console.error(e);
    statusText.textContent = 'Kuch samajh nahi aaya, phir try karo';
  } finally {
    isListening = false;
    orb.classList.remove('listening');
    micBtn.classList.remove('active');
  }
}

micBtn.addEventListener('click', async () => {
  if (NativeSTT) {
    if (isListening) {
      await NativeSTT.stop();
      isListening = false;
      orb.classList.remove('listening');
      micBtn.classList.remove('active');
    } else {
      startNativeListening();
    }
    return;
  }
  if (!recognition) return;
  speechSynthesis.cancel();
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
sendBtn.addEventListener('click', () => {
  const val = textInput.value.trim();
  if (!val) return;
  addMessage('me', val);
  sendToShreya(val);
  textInput.value = '';
});
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

function addMessage(who, text) {
  const div = document.createElement('div');
  div.className = who === 'me' ? 'me' : 'her';
  div.textContent = (who === 'me' ? 'Tum: ' : 'Shreya: ') + text;
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;

  chatHistory.push({ role: who === 'me' ? 'user' : 'model', text });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  localStorage.setItem('shreya_chat', JSON.stringify(chatHistory));
}

function renderTranscript() {
  transcriptEl.innerHTML = '';
  chatHistory.forEach(m => {
    const div = document.createElement('div');
    div.className = m.role === 'user' ? 'me' : 'her';
    div.textContent = (m.role === 'user' ? 'Tum: ' : 'Shreya: ') + m.text;
    transcriptEl.appendChild(div);
  });
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function sendToShreya(userText) {
  statusText.textContent = 'Shreya soch rahi hai...';
  try {
    const contents = chatHistory.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt() }] },
          contents
        })
      }
    );
    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, thoda network issue ho gaya, phir bolo.';
    addMessage('her', reply);
    speak(reply);
  } catch (err) {
    statusText.textContent = 'Connection mein dikkat aa gayi';
    console.error(err);
  }
}

async function speak(text) {
  if (NativeTTS) {
    orb.classList.add('speaking');
    statusText.textContent = 'Shreya bol rahi hai...';
    try {
      await NativeTTS.speak({
        text: text,
        lang: 'hi-IN',
        rate: 1.0,
        pitch: 1.15,
        volume: 1.0,
        category: 'ambient'
      });
    } catch (e) {
      console.error(e);
    }
    orb.classList.remove('speaking');
    statusText.textContent = 'Tap karke bolo';
    releaseWakeLock();
    return;
  }
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const chosen = voices.find(v => v.voiceURI === selectedVoiceURI);
  if (chosen) utter.voice = chosen;
  utter.rate = 1;
  utter.pitch = 1.1;
  utter.onstart = () => {
    orb.classList.add('speaking');
    statusText.textContent = 'Shreya bol rahi hai...';
  };
  utter.onend = () => {
    orb.classList.remove('speaking');
    statusText.textContent = 'Tap karke bolo';
    releaseWakeLock();
  };
  speechSynthesis.speak(utter);
}

// ---------- Owner panel (PIN-protected) ----------
const topbarName = document.getElementById('topbarName') || document.querySelector('.topbar-name');
const ownerPinModal = document.getElementById('ownerPinModal');
const ownerPinInput = document.getElementById('ownerPinInput');
const ownerPinSubmit = document.getElementById('ownerPinSubmit');
const ownerPinCancel = document.getElementById('ownerPinCancel');
const ownerPanel = document.getElementById('ownerPanel');
const ownerNoteInput = document.getElementById('ownerNoteInput');
const ownerPanelSave = document.getElementById('ownerPanelSave');
const ownerPanelClose = document.getElementById('ownerPanelClose');

if (topbarName) {
  topbarName.addEventListener('click', () => {
    titleTapCount++;
    clearTimeout(titleTapTimer);
    titleTapTimer = setTimeout(() => { titleTapCount = 0; }, 1500);
    if (titleTapCount >= 5) {
      titleTapCount = 0;
      ownerPinModal.classList.remove('hidden');
    }
  });
}
if (ownerPinCancel) ownerPinCancel.addEventListener('click', () => {
  ownerPinModal.classList.add('hidden');
  ownerPinInput.value = '';
});
if (ownerPinSubmit) ownerPinSubmit.addEventListener('click', () => {
  if (ownerPinInput.value === OWNER_PIN) {
    ownerPinModal.classList.add('hidden');
    ownerPinInput.value = '';
    ownerNoteInput.value = localStorage.getItem('shreya_owner_note') || '';
    ownerPanel.classList.remove('hidden');
  } else {
    ownerPinInput.value = '';
    ownerPinInput.placeholder = 'Galat PIN, phir try karo';
  }
});
if (ownerPanelSave) ownerPanelSave.addEventListener('click', () => {
  localStorage.setItem('shreya_owner_note', ownerNoteInput.value.trim());
  ownerPanel.classList.add('hidden');
});
if (ownerPanelClose) ownerPanelClose.addEventListener('click', () => {
  ownerPanel.classList.add('hidden');
});

init();

// ---------- Background floating particles ----------
function spawnParticles() {
  const container = document.getElementById('bgParticles');
  if (!container) return;
  const symbols = ['💗', '✨', '💫', '💖'];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.className = 'p';
    span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const size = 10 + Math.random() * 14;
    span.style.left = Math.random() * 100 + 'vw';
    span.style.fontSize = size + 'px';
    span.style.animationDuration = (10 + Math.random() * 14) + 's';
    span.style.animationDelay = (Math.random() * 14) + 's';
    container.appendChild(span);
  }
}
spawnParticles();
