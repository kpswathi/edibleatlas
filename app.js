let DB = {};

const countryInfo = {
    "India": { emoji: "🇮🇳", bg: "assets/india_market_1778310758930.png", defaultDishEmoji: "🥞" },
    "Sri Lanka": { emoji: "🇱🇰", bg: "assets/sri_lanka_nature.png", defaultDishEmoji: "🥞" },
    "Malaysia": { emoji: "🇲🇾", bg: "assets/japan_street_1778310737300.png", defaultDishEmoji: "🫓" },
    "Myanmar": { emoji: "🇲🇲", bg: "assets/india_market_1778310758930.png", defaultDishEmoji: "🥞" },
    "Indonesia": { emoji: "🇮🇩", bg: "assets/indonesia_feast.png", defaultDishEmoji: "🥞" },
    "Singapore": { emoji: "🇸🇬", bg: "assets/japan_street_1778310737300.png", defaultDishEmoji: "🫓" }
};

// Web Audio API for UI sounds
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTravelSound() {
    if (!soundEnabled) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) { console.warn("Audio not supported"); }
}

function playStampSound() {
    if (!soundEnabled) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) { console.warn("Audio not supported"); }
}

// State
let selectedCountry = null;
let selectedDishName = null;
let journeyQueue = [];
let currentQuestionIndex = 0;
let correctCount = 0;
let explorationMode = null; // 'dish' or 'route'
let lives = 3;
let streak = 0;

// DOM
const screens = {
    home: document.getElementById('home-screen'),
    setup: document.getElementById('setup-screen'),
    routeSetup: document.getElementById('route-setup-screen'),
    game: document.getElementById('game-screen'),
    reveal: document.getElementById('reveal-screen'),
    complete: document.getElementById('complete-screen'),
    passport: document.getElementById('passport-screen')
};

// Content Loader
async function loadContent() {
    try {
        const response = await fetch('content.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} (File not found yet, wait for GitHub to finish building)`);
        }
        const data = await response.json();

        // Parse into DB structure
        data.dishExploration.forEach(item => {
            if (!DB[item.country]) {
                const info = countryInfo[item.country] || { emoji: "🌍", bg: "assets/world_food_map_v2_1778311283030.png", defaultDishEmoji: "🍲" };
                DB[item.country] = {
                    emoji: info.emoji,
                    bg: info.bg,
                    dishes: []
                };
            }

            const chapters = item.chapters.map(ch => {
                const aIndex = ch.options.indexOf(ch.answer);
                return {
                    phase: ch.title,
                    text: `Let's explore the history of ${item.dish}. Answer the question below to unlock a culinary fact!`,
                    q: ch.question,
                    options: ch.options,
                    a: aIndex !== -1 ? aIndex : 0,
                    postAnswerTrivia: ch.trivia
                };
            });

            DB[item.country].dishes.push({
                name: item.dish,
                emoji: countryInfo[item.country]?.defaultDishEmoji || "🍲",
                desc: item.description,
                chapters: chapters
            });
        });

        init();
    } catch (err) {
        console.error("Failed to load content.json", err);
        const subtitle = document.querySelector('.main-subtitle');
        if (window.location.protocol === 'file:') {
            subtitle.textContent = "Error: Browsers block local JSON files. Use VS Code Live Server!";
        } else {
            subtitle.textContent = "Error loading content (GitHub might still be building). Please refresh!";
        }
        subtitle.style.color = "red";
    }
}

// Init
function init() {
    renderPassportStamps();

    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound !== null) {
        soundEnabled = savedSound === 'true';
        document.getElementById('toggle-sound-btn').textContent = soundEnabled ? '🔊' : '🔇';
    }

    document.getElementById('toggle-sound-btn').addEventListener('click', (e) => {
        soundEnabled = !soundEnabled;
        e.currentTarget.textContent = soundEnabled ? '🔊' : '🔇';
        localStorage.setItem('soundEnabled', soundEnabled);
        if (soundEnabled) initAudio();
    });

    // Set default exploration mode to dish so markers are instantly clickable
    explorationMode = 'dish';

    document.querySelectorAll('.map-marker').forEach(marker => {
        marker.addEventListener('click', (e) => {
            const country = e.currentTarget.dataset.country;
            if (!DB[country] || DB[country].dishes.length === 0) {
                alert(`Content for ${country} is not yet available in content.json!`);
                return;
            }
            zoomToCountry(e.currentTarget, country);
        });
    });

    document.getElementById('view-passport-btn')?.addEventListener('click', () => {
        document.getElementById('map-container').style.filter = 'brightness(0.3) blur(5px)';
        showScreen('passport');
    });

    document.getElementById('close-passport-btn')?.addEventListener('click', () => {
        document.getElementById('map-container').style.filter = 'none';
        showScreen('home');
    });

    const returnHome = () => resetMap();

    document.getElementById('cancel-setup-btn')?.addEventListener('click', returnHome);
    document.getElementById('cancel-route-btn')?.addEventListener('click', returnHome);
    document.getElementById('quit-journey-btn')?.addEventListener('click', returnHome);
    document.getElementById('quit-reveal-btn')?.addEventListener('click', returnHome);
    document.getElementById('back-home-btn')?.addEventListener('click', returnHome);

    document.getElementById('reveal-next-btn')?.addEventListener('click', () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < journeyQueue.length) {
            renderQuestion();
            showScreen('game');
        } else {
            // Reached the end of the selected stops
            if (confirm("You've completed your selected stops! Do you want to continue playing this route?")) {
                const countryData = DB[selectedCountry];
                const targetDish = countryData.dishes.find(d => d.name === selectedDishName);
                if (journeyQueue.length < targetDish.chapters.length) {
                    // Add more chapters
                    let remaining = targetDish.chapters.filter(ch => !journeyQueue.find(q => q.q === ch.question));
                    shuffleArray(remaining);
                    const addCount = Math.min(5, remaining.length);
                    const newQuestions = remaining.slice(0, addCount).map(ch => ({
                        dishName: targetDish.name,
                        dishEmoji: targetDish.emoji,
                        countryEmoji: countryData.emoji,
                        countryName: selectedCountry,
                        phase: ch.phase,
                        text: `Let's explore the history of ${targetDish.name}. Answer the question below to unlock a culinary fact!`,
                        q: ch.question,
                        options: ch.options,
                        a: ch.options.indexOf(ch.answer) !== -1 ? ch.options.indexOf(ch.answer) : 0,
                        postAnswerTrivia: ch.trivia
                    }));
                    journeyQueue = journeyQueue.concat(newQuestions);
                    renderQuestion();
                    showScreen('game');
                } else {
                    alert("You've played all available questions for this dish!");
                    finishJourney();
                }
            } else {
                finishJourney();
            }
        }
    });

    document.querySelectorAll('.length-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const length = parseInt(e.currentTarget.dataset.length);
            startDishJourney(length);
        });
    });

    document.querySelectorAll('.route-length-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const length = parseInt(e.currentTarget.dataset.length);
            startTradeRoute(length);
        });
    });
}

function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function zoomToCountry(element, country) {
    playTravelSound();

    const mapContainer = document.getElementById('map-container');
    mapContainer.style.transform = 'scale(2.5)';
    mapContainer.style.opacity = '0';

    document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(43, 16, 85, 0.8), rgba(117, 151, 222, 0.6), rgba(242, 199, 146, 0.8)), url('${DB[country].bg}')`;

    setTimeout(() => {
        openSetup(country);
    }, 1000);
}

function resetMap() {
    const mapContainer = document.getElementById('map-container');
    mapContainer.style.transform = 'scale(1) translate(0, 0)';
    mapContainer.style.opacity = '1';
    mapContainer.style.filter = 'none';
    document.body.style.backgroundImage = "none";
    explorationMode = 'dish';
    showScreen('home');
}

function openSetup(country) {
    selectedCountry = country;
    document.getElementById('setup-country-badge').textContent = `${DB[country].emoji} ${country}`;

    const dishGrid = document.getElementById('dish-grid');
    dishGrid.innerHTML = '';

    document.getElementById('length-selection').style.display = 'none';

    DB[country].dishes.forEach(dish => {
        const div = document.createElement('div');
        div.className = 'dish-card';
        div.id = `dish-${dish.name.replace(/\s+/g, '')}`;
        div.innerHTML = `
            <div class="dish-card-emoji">${dish.emoji}</div>
            <div class="dish-card-info">
                <h3>${dish.name}</h3>
                <p>${dish.desc}</p>
            </div>
        `;
        div.onclick = () => selectDish(dish.name);
        dishGrid.appendChild(div);
    });

    showScreen('setup');
}

function selectDish(dishName) {
    playStampSound();
    selectedDishName = dishName;
    document.getElementById('length-selection').style.display = 'block';

    document.querySelectorAll('.dish-card').forEach(card => card.classList.remove('selected'));
    document.getElementById(`dish-${dishName.replace(/\s+/g, '')}`).classList.add('selected');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function startDishJourney(length) {
    playTravelSound();
    correctCount = 0;
    currentQuestionIndex = 0;

    const countryData = DB[selectedCountry];
    const targetDish = countryData.dishes.find(d => d.name === selectedDishName);

    // Prevent repeated questions by picking randomly from the available chapters up to 'length'
    let availableChapters = [...targetDish.chapters];
    shuffleArray(availableChapters);
    availableChapters = availableChapters.slice(0, length);

    journeyQueue = availableChapters.map(ch => ({
        dishName: targetDish.name,
        dishEmoji: targetDish.emoji,
        countryEmoji: countryData.emoji,
        countryName: selectedCountry,
        phase: ch.phase,
        text: ch.text,
        q: ch.q,
        options: ch.options,
        a: ch.a,
        postAnswerTrivia: ch.postAnswerTrivia
    }));

    document.getElementById('journey-dish').textContent = `${targetDish.emoji} ${targetDish.name} Trail`;
    renderQuestion();
    showScreen('game');
}

function startTradeRoute(length) {
    playTravelSound();
    correctCount = 0;
    currentQuestionIndex = 0;

    let allDishes = [];
    Object.keys(DB).forEach(countryName => {
        DB[countryName].dishes.forEach(dish => {
            allDishes.push({ ...dish, countryName });
        });
    });

    let mixedChapters = [];
    allDishes.forEach(dish => {
        dish.chapters.forEach(ch => {
            mixedChapters.push({
                dishName: dish.name,
                dishEmoji: dish.emoji,
                countryEmoji: DB[dish.countryName].emoji,
                countryName: dish.countryName,
                phase: ch.phase,
                text: ch.text,
                q: ch.q,
                options: ch.options,
                a: ch.a,
                postAnswerTrivia: ch.postAnswerTrivia
            });
        });
    });

    shuffleArray(mixedChapters);
    journeyQueue = mixedChapters.slice(0, length);

    if (journeyQueue.length === 0) {
        alert("No dishes available to start a route!");
        return;
    }

    const startCountry = journeyQueue[0].countryName;
    const mapContainer = document.getElementById('map-container');
    mapContainer.style.transform = 'scale(2.5)';
    mapContainer.style.opacity = '0';
    document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(43, 16, 85, 0.8), rgba(117, 151, 222, 0.6), rgba(242, 199, 146, 0.8)), url('${DB[startCountry].bg}')`;

    document.getElementById('journey-dish').textContent = `🌍 Trade Route`;

    setTimeout(() => {
        renderQuestion();
        showScreen('game');
    }, 1000);
}

function renderQuestion() {
    const current = journeyQueue[currentQuestionIndex];

    if (currentQuestionIndex > 0 && journeyQueue[currentQuestionIndex - 1].countryName !== current.countryName) {
        playTravelSound();
        document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(43, 16, 85, 0.8), rgba(117, 151, 222, 0.6), rgba(242, 199, 146, 0.8)), url('${DB[current.countryName].bg}')`;
    }

    document.getElementById('journey-progress').textContent = `Stop ${currentQuestionIndex + 1} / ${journeyQueue.length}`;
    document.getElementById('journey-phase').textContent = `Chapter: ${current.phase}`;
    document.getElementById('narrative-text').textContent = current.text;

    const qEl = document.getElementById('question-text');
    qEl.textContent = current.q;
    qEl.style.animation = 'none';
    qEl.offsetHeight;
    qEl.style.animation = 'popIn 0.4s ease-out';

    const card = document.querySelector('.question-card');
    const existingContinueBtn = card.querySelector('.continue-btn');
    if (existingContinueBtn) existingContinueBtn.remove();

    const container = document.getElementById('options-container');
    container.innerHTML = '';

    current.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span style="font-weight:bold; color:var(--primary-color); margin-right:12px;">${String.fromCharCode(65 + idx)}</span> ${opt}`;

        btn.onclick = () => handleAnswer(idx, btn, current.a);
        container.appendChild(btn);
    });
}

function handleAnswer(selectedIdx, btn, correctIdx) {
    const allBtns = document.querySelectorAll('.option-btn');
    allBtns.forEach(b => b.disabled = true);

    const isCorrect = selectedIdx === correctIdx;

    if (isCorrect) {
        btn.classList.add('correct');
        correctCount++;
        playStampSound();
    } else {
        btn.classList.add('wrong');
        allBtns[correctIdx].classList.add('correct');
    }

    // Show trivia popup after a short delay
    setTimeout(() => {
        showRevealScreen(isCorrect);
    }, 1000);
}

function showRevealScreen(isCorrect) {
    const current = journeyQueue[currentQuestionIndex];
    const titleEl = document.getElementById('reveal-title');
    const factEl = document.getElementById('reveal-fact');
    const emojiEl = document.getElementById('reveal-emoji');
    const countryEl = document.getElementById('reveal-country');

    if (isCorrect) {
        titleEl.textContent = "Correct! 🎉";
        titleEl.className = "reveal-correct";
    } else {
        titleEl.textContent = "Not quite! 💡";
        titleEl.className = "reveal-wrong";
    }

    factEl.textContent = current.postAnswerTrivia || "That's a fascinating culinary fact!";
    emojiEl.textContent = current.dishEmoji;
    countryEl.textContent = current.countryEmoji;

    showScreen('reveal');
}

function finishJourney() {
    playStampSound();

    if (explorationMode === 'dish') {
        let stamps = JSON.parse(localStorage.getItem('passportStamps')) || [];
        if (!stamps.includes(selectedCountry)) {
            stamps.push(selectedCountry);
            localStorage.setItem('passportStamps', JSON.stringify(stamps));
        }
        document.getElementById('earned-stamp').textContent = DB[selectedCountry].emoji;
    } else {
        let stamps = JSON.parse(localStorage.getItem('passportStamps')) || [];
        if (!stamps.includes("TradeRoute")) {
            stamps.push("TradeRoute");
            localStorage.setItem('passportStamps', JSON.stringify(stamps));
        }
        document.getElementById('earned-stamp').textContent = "🌍";
    }

    document.getElementById('complete-title').textContent = "Route Complete!";
    document.getElementById('stamp-reveal-box').style.display = 'inline-block';
    document.getElementById('stamp-text').textContent = "Passport stamp collected!";
    document.getElementById('final-score').textContent = `${correctCount} / ${journeyQueue.length}`;

    renderPassportStamps();
    showScreen('complete');
}

function renderPassportStamps() {
    const stamps = JSON.parse(localStorage.getItem('passportStamps')) || [];
    const container = document.getElementById('stamps-container');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(DB).forEach(country => {
        const slot = document.createElement('div');
        slot.className = 'stamp-slot';
        if (stamps.includes(country)) {
            slot.classList.add('collected');
            slot.textContent = DB[country].emoji;
            slot.title = country;
        } else {
            slot.textContent = '✈️';
        }
        container.appendChild(slot);
    });

    const tradeSlot = document.createElement('div');
    tradeSlot.className = 'stamp-slot';
    if (stamps.includes("TradeRoute")) {
        tradeSlot.classList.add('collected');
        tradeSlot.textContent = "🌍";
        tradeSlot.title = "Trade Route";
    } else {
        tradeSlot.textContent = '🐪';
    }
    container.appendChild(tradeSlot);
}

// Start sequence
document.addEventListener('DOMContentLoaded', loadContent);
