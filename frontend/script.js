document.addEventListener('DOMContentLoaded', function() {
    const instrumentSelect = document.getElementById('instrument');
    const customTuningDiv = document.getElementById('custom-tuning');
    const chatOutput = document.getElementById('chat-output');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const listenBtn = document.getElementById('listen-btn');
    const needle = document.querySelector('.needle');
    const frequencyDisplay = document.querySelector('.frequency-display');
    const noteDisplay = document.querySelector('.note-display');
    
    let audioContext;
    let analyser;
    let microphone;
    let isListening = false;
    
    // Instrument tuning presets
    const tuningPresets = {
        guitar: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
        bass: ['E1', 'A1', 'D2', 'G2'],
        violin: ['G3', 'D4', 'A4', 'E5'],
        cello: ['C2', 'G2', 'D3', 'A3'],
        ukulele: ['G4', 'C4', 'E4', 'A4']
    };
    
    // Note frequency mapping (simplified)
    const noteFrequencies = {
        'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45,
        'E': 20.60, 'F': 21.83, 'F#': 23.12, 'G': 24.50,
        'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
    };
    
    // Show/hide custom tuning field
    instrumentSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customTuningDiv.classList.remove('hidden');
        } else {
            customTuningDiv.classList.add('hidden');
            // Send initial tuning message
            sendBotMessage(`Selected ${this.options[this.selectedIndex].text}. The standard tuning is: ${tuningPresets[this.value].join(', ')}. Play a note or ask for help tuning.`);
        }
    });
    
    // Send message on button click
    sendBtn.addEventListener('click', sendMessage);
    
    // Send message on Enter key
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Toggle microphone listening
    listenBtn.addEventListener('click', toggleListening);
    
    // Initial bot message
    sendBotMessage("Welcome to Instrument Tuner AI! Select your instrument to get started.");
    
    function sendMessage() {
        const message = userInput.value.trim();
        if (message) {
            displayMessage(message, 'user');
            userInput.value = '';
            
            // Process user message
            processUserMessage(message);
        }
    }
    
    function displayMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `${sender}-message`);
        messageDiv.textContent = message;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
    
    function sendBotMessage(message) {
        displayMessage(message, 'bot');
    }
    
    function processUserMessage(message) {
        // Simple response logic - in a real app, this would call the backend API
        const instrument = instrumentSelect.value;
        
        if (message.toLowerCase().includes('help')) {
            if (instrument === 'custom') {
                sendBotMessage("For custom tuning, please enter your desired notes in the tuning field above, separated by commas. Then play each note and I'll help you tune it.");
            } else {
                const tuning = tuningPresets[instrument];
                sendBotMessage(`To tune your ${instrumentSelect.options[instrumentSelect.selectedIndex].text}, you need to tune the strings to these notes: ${tuning.join(', ')}. Play a note and I'll detect if it's correct.`);
            }
        } else if (message.toLowerCase().includes('standard tuning')) {
            if (instrument !== 'custom') {
                sendBotMessage(`The standard tuning for ${instrumentSelect.options[instrumentSelect.selectedIndex].text} is: ${tuningPresets[instrument].join(', ')}`);
            } else {
                sendBotMessage("You've selected custom tuning. Please specify your desired tuning notes above.");
            }
        } else if (message.toLowerCase().includes('play') || message.toLowerCase().includes('note')) {
            sendBotMessage("Click the microphone button to play a note, and I'll analyze it to help you tune.");
        } else {
            // Default response - in a real app, this would be handled by the AI backend
            sendBotMessage("I can help you tune your instrument. Ask about standard tuning, or play a note for me to analyze.");
        }
    }
    
    function toggleListening() {
        if (!isListening) {
            startListening();
            listenBtn.textContent = "🛑 Stop";
            listenBtn.style.backgroundColor = "#e74c3c";
            sendBotMessage("Listening... Play a note on your instrument.");
        } else {
            stopListening();
            listenBtn.textContent = "🎤 Listen";
            listenBtn.style.backgroundColor = "#2ecc71";
            sendBotMessage("Stopped listening. How can I help you with your tuning?");
        }
        isListening = !isListening;
    }
    
    function startListening() {
        // Initialize audio context if not already done
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
        }
        
        // Get microphone access
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(function(stream) {
                microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);
                
                // Start analyzing the audio
                analyzePitch();
            })
            .catch(function(err) {
                sendBotMessage("Error accessing microphone: " + err.message);
                isListening = false;
                listenBtn.textContent = "🎤 Listen";
                listenBtn.style.backgroundColor = "#2ecc71";
            });
    }
    
    function stopListening() {
        if (microphone && audioContext) {
            microphone.disconnect();
        }
    }
    
    function analyzePitch() {
        if (!isListening) return;
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        
        // Simple pitch detection (autocorrelation)
        let bestOffset = -1;
        let bestCorrelation = 0;
        
        for (let offset = 0; offset < bufferLength; offset++) {
            let correlation = 0;
            
            for (let i = 0; i < bufferLength - offset; i++) {
                correlation += Math.abs(dataArray[i] - 128) * Math.abs(dataArray[i + offset] - 128);
            }
            
            correlation /= bufferLength - offset;
            
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        }
        
        if (bestOffset > -1) {
            const frequency = audioContext.sampleRate / bestOffset;
            updateTunerDisplay(frequency);
            
            // Find closest note
            const noteInfo = findClosestNote(frequency);
            
            // Update display
            frequencyDisplay.textContent = frequency.toFixed(1) + " Hz";
            noteDisplay.textContent = noteInfo.note;
            
            // Position needle (-30 to 30 degrees for -50 to +50 cents)
            const centsOff = noteInfo.cents;
            const needleAngle = Math.max(-30, Math.min(30, centsOff * 0.6));
            needle.style.transform = `rotate(${needleAngle}deg)`;
            
            // Give tuning feedback
            if (Math.abs(centsOff) < 5) {
                needle.style.backgroundColor = "#2ecc71";
                // In a real app, you would only send this message once when in tune
                // sendBotMessage(`Perfect! Your note is ${noteInfo.note} at ${frequency.toFixed(1)} Hz.`);
            } else if (Math.abs(centsOff) < 20) {
                needle.style.backgroundColor = "#f39c12";
            } else {
                needle.style.backgroundColor = "#e74c3c";
            }
        }
        
        // Continue analyzing
        requestAnimationFrame(analyzePitch);
    }
    
    function findClosestNote(frequency) {
        // Find the closest note and how many cents off it is
        const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const A4 = 440;
        const semitoneRatio = Math.pow(2, 1/12);
        
        // Calculate how many semitones away from A4
        const semitonesFromA4 = 12 * Math.log2(frequency / A4);
        const roundedSemitones = Math.round(semitonesFromA4);
        const cents = 100 * (semitonesFromA4 - roundedSemitones);
        
        // Find the note name
        const noteIndex = (roundedSemitones % 12 + 12) % 12;
        const noteName = noteNames[noteIndex];
        
        // Calculate the octave
        const octave = Math.floor(roundedSemitones / 12) + 4;
        
        return {
            note: noteName + octave,
            cents: cents
        };
    }
    
    function updateTunerDisplay(frequency) {
        // This would be more sophisticated in a real app
        console.log("Detected frequency:", frequency);
    }
});
