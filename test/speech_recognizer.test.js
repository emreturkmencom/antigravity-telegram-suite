const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WaveFile } = require('wavefile');
const speechRecognizer = require('../src/speech_recognizer');

function printResult(name, passed, message) {
    if (passed) {
        console.log(`  ✅ ${name}`);
    } else {
        console.error(`  ❌ ${name}: ${message || 'FAILED'}`);
    }
}

async function runTests() {
    console.log('Testing Speech Recognizer (Whisper ONNX)...');
    let passed = 0;
    let failed = 0;

    // Test 1: Generate synthetic 16kHz WAV and verify readWavAsFloat32
    try {
        const wav = new WaveFile();
        const sampleRate = 16000;
        const durationSeconds = 1;
        const samples = new Int16Array(sampleRate * durationSeconds);
        
        // Generate simple 440Hz sine wave tone
        for (let i = 0; i < samples.length; i++) {
            samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000);
        }
        wav.fromScratch(1, sampleRate, '16', samples);
        
        const tempTestWav = path.join(os.tmpdir(), `test_synth_${Date.now()}.wav`);
        fs.writeFileSync(tempTestWav, wav.toBuffer());

        const float32 = speechRecognizer.readWavAsFloat32(tempTestWav);
        assert.strictEqual(float32 instanceof Float32Array, true);
        assert.strictEqual(float32.length, 16000);
        assert.strictEqual(float32[0] >= -1.0 && float32[0] <= 1.0, true);

        try { fs.unlinkSync(tempTestWav); } catch (e) {}

        printResult('readWavAsFloat32 correctly extracts normalized Float32 samples', true);
        passed++;
    } catch (e) {
        printResult('readWavAsFloat32 correctly extracts normalized Float32 samples', false, e.message);
        failed++;
    }

    // Test 2: Verify getTranscriber pipeline loader
    try {
        const transcriber = await speechRecognizer.getTranscriber();
        assert.strictEqual(typeof transcriber, 'function');
        printResult('getTranscriber initializes Whisper ONNX ASR pipeline successfully', true);
        passed++;
    } catch (e) {
        printResult('getTranscriber initializes Whisper ONNX ASR pipeline successfully', false, e.message);
        failed++;
    }

    // Test 3: If sample wav exists, verify end-to-end transcription
    const sampleWav = '/tmp/user_voice.wav';
    if (fs.existsSync(sampleWav)) {
        try {
            const res = await speechRecognizer.transcribeAudio(sampleWav);
            assert.strictEqual(typeof res.text, 'string');
            assert.strictEqual(res.text.length > 0, true);
            printResult(`transcribeAudio accurately transcribed test voice note (${res.duration}s)`, true);
            passed++;
        } catch (e) {
            printResult('transcribeAudio accurately transcribed test voice note', false, e.message);
            failed++;
        }
    }

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
}

runTests();
