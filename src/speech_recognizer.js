const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

let pipelineInstance = null;
let isInitializing = false;
let initPromise = null;

/**
 * Lazy loads and initializes the local Whisper ONNX pipeline
 */
async function getTranscriber() {
    if (pipelineInstance) return pipelineInstance;
    if (isInitializing && initPromise) return initPromise;

    isInitializing = true;
    initPromise = (async () => {
        try {
            const { pipeline, env } = await import('@xenova/transformers');
            
            // Set cache directory to ~/.cache/xenova or project-local
            env.cacheDir = path.join(os.homedir(), '.cache', 'xenova');
            env.allowLocalModels = true;

            const modelName = process.env.LOCAL_WHISPER_MODEL || 'Xenova/whisper-tiny';
            console.log(`[STT] Loading local Whisper model: ${modelName}...`);
            
            const transcriber = await pipeline('automatic-speech-recognition', modelName, {
                quantized: true
            });
            pipelineInstance = transcriber;
            console.log('[STT] Local Whisper pipeline ready!');
            return pipelineInstance;
        } finally {
            isInitializing = false;
        }
    })();

    return initPromise;
}

/**
 * Converts any audio file (.ogg, .mp3, .m4a, etc.) to 16kHz mono WAV for Whisper
 * @param {string} inputPath - Absolute path to input audio file
 * @returns {Promise<string>} Path to temporary converted 16kHz WAV file
 */
async function convertTo16kHzWav(inputPath) {
    const tempWavPath = path.join(os.tmpdir(), `stt_converted_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
    
    // Use ffmpeg with standard 16kHz mono PCM
    const args = [
        '-y',
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        tempWavPath
    ];

    try {
        await execFileAsync('ffmpeg', args);
        return tempWavPath;
    } catch (err) {
        // If ffmpeg fails, check if input is already wav
        if (inputPath.endsWith('.wav') && fs.existsSync(inputPath)) {
            return inputPath;
        }
        throw new Error(`FFmpeg audio conversion failed: ${err.message}`);
    }
}

/**
 * Reads a 16kHz WAV file and returns a Float32Array of audio samples
 * @param {string} wavPath
 * @returns {Float32Array}
 */
function readWavAsFloat32(wavPath) {
    const WaveFile = require('wavefile').WaveFile;
    const buffer = fs.readFileSync(wavPath);
    const wav = new WaveFile(buffer);
    wav.toSampleRate(16000);
    
    let samples = wav.getSamples();
    if (Array.isArray(samples)) {
        samples = samples[0];
    }
    
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        float32[i] = samples[i] / 32768.0;
    }
    return float32;
}

/**
 * Transcribes an audio file locally using Whisper ONNX
 * @param {string} audioPath - Path to audio file (.ogg, .wav, .mp3, etc.)
 * @param {object} options - Optional language / task options
 * @returns {Promise<{ text: string, duration?: number }>}
 */
async function transcribeAudio(audioPath, options = {}) {
    if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
    }

    let tempWav = null;
    try {
        const startTime = Date.now();
        tempWav = await convertTo16kHzWav(audioPath);
        const audioData = readWavAsFloat32(tempWav);

        const transcriber = await getTranscriber();
        
        const params = {
            chunk_length_s: 30,
            stride_length_s: 5,
            ...options
        };

        const result = await transcriber(audioData, params);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        const text = (result && result.text) ? result.text.trim() : '';
        console.log(`[STT] Transcribed in ${duration}s: "${text}"`);
        
        return {
            text,
            duration: parseFloat(duration)
        };
    } finally {
        if (tempWav && tempWav !== audioPath && fs.existsSync(tempWav)) {
            try { fs.unlinkSync(tempWav); } catch (e) {}
        }
    }
}

module.exports = {
    transcribeAudio,
    getTranscriber,
    convertTo16kHzWav,
    readWavAsFloat32
};
