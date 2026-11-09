#!/usr/bin/env python3
import os
import subprocess
import numpy as np
import wave
from gtts import gTTS

AUDIO_DIR = "/home/thinh/ca-nhan/tactic/recordings/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE_SCRIPTS = [
    {
        "id": "clip0_intro",
        "time": 0.5,
        "text": "Chào mừng Ban giám khảo đến với bản demo Tactic AdPulse, Đề số 8, Bảng A cuộc thi Vibe Coding 2026."
    },
    {
        "id": "clip1_feat1",
        "time": 10.0,
        "text": "Tính năng 1: Nhập liệu đa phương thức. Hỗ trợ nhập từng ngày, nạp nhanh mẫu 14 ngày, bảng nhập hàng loạt đa dòng và trích xuất tự động từ file Excel, Word, PDF hoặc dán ảnh OCR."
    },
    {
        "id": "clip2_feat2",
        "time": 25.5,
        "text": "Tính năng 2: Tự động hóa bốn chỉ số KPI cốt lõi gồm CTR, CPC, CPA và CVR. Đánh dấu ngày CPA tối ưu nhất và trực quan hóa biểu đồ tương tác đa trục."
    },
    {
        "id": "clip3_feat3",
        "time": 41.0,
        "text": "Tính năng 3: Chẩn đoán phễu nhân quả. Tự động đối chiếu chu kỳ và phân rã biến động CPA theo công thức CPA bằng CPC chia CVR, phân loại vào bốn góc phần tư xu hướng."
    },
    {
        "id": "clip4_feat4",
        "time": 55.0,
        "text": "Tính năng 4: Tích hợp trợ lý AI Google Gemini 3.8 Flash, đề xuất ba khuyến nghị thực chiến chia hai dòng rõ ràng Vì sao và Đo thế nào, cùng trợ lý hỏi đáp số liệu thời gian thực."
    },
    {
        "id": "clip5_feat5",
        "time": 69.5,
        "text": "Tính năng 5: Xuất báo cáo đa kênh, sao chép tóm tắt gửi nhanh qua Zalo, Slack, tải tệp CSV và tải trọn bộ gói mã nguồn dự thi Source ZIP chỉ với một cú click."
    },
    {
        "id": "clip6_outro",
        "time": 82.5,
        "text": "Tactic AdPulse đã hoàn thành trọn vẹn 5 tính năng, vượt qua toàn bộ ca kiểm thử thực tế và sẵn sàng triển khai. Cảm ơn Ban giám khảo."
    }
]

def generate_voice_clips():
    print("Generating voice clips with gTTS...")
    for item in VOICE_SCRIPTS:
        out_mp3 = os.path.join(AUDIO_DIR, f"{item['id']}.mp3")
        out_wav = os.path.join(AUDIO_DIR, f"{item['id']}.wav")
        if not os.path.exists(out_wav):
            tts = gTTS(item["text"], lang="vi", slow=False)
            tts.save(out_mp3)
            # Speed up slightly (1.12x) for energetic, crisp pacing and convert to 44100Hz mono WAV
            subprocess.run([
                "ffmpeg", "-y", "-i", out_mp3,
                "-filter:a", "atempo=1.12",
                "-ar", "44100", "-ac", "1",
                out_wav
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            print(f"Generated: {out_wav}")

def generate_ambient_music(duration=90.0, sample_rate=44100):
    print("Generating ambient background synth pad with numpy...")
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    
    # Chord progression: Cmaj7 - Am7 - Fmaj7 - G (cycle every 16 seconds)
    # Frequencies (Hz):
    # Cmaj7: C3 (130.81), E3 (164.81), G3 (196.00), B3 (246.94)
    # Am7:   A2 (110.00), C3 (130.81), E3 (164.81), G3 (196.00)
    # Fmaj7: F2 (87.31),  A2 (110.00), C3 (130.81), E3 (164.81)
    # G6:    G2 (98.00),  B2 (123.47), D3 (146.83), E3 (164.81)
    
    chords = [
        [130.81, 164.81, 196.00, 246.94], # Cmaj7
        [110.00, 130.81, 164.81, 196.00], # Am7
        [87.31, 110.00, 130.81, 164.81],  # Fmaj7
        [98.00, 123.47, 146.83, 164.81]   # G
    ]
    chord_len = 4.0 # 4 seconds per chord = 16s cycle
    
    signal = np.zeros_like(t)
    for i, freq_set in enumerate(chords):
        # Create mask for when this chord is active in the cycle
        cycle_pos = np.mod(t, 16.0)
        mask = (cycle_pos >= i * chord_len) & (cycle_pos < (i + 1) * chord_len)
        
        # Smooth cross-fade envelope
        phase = np.clip((cycle_pos - i * chord_len) / chord_len, 0.0, 1.0)
        env = np.sin(phase * np.pi) ** 1.5
        
        chord_wave = np.zeros_like(t)
        for freq in freq_set:
            # Fundamental + soft harmonics
            chord_wave += 0.4 * np.sin(2 * np.pi * freq * t)
            chord_wave += 0.15 * np.sin(2 * np.pi * freq * 2 * t)
            chord_wave += 0.05 * np.sin(2 * np.pi * freq * 3 * t)
            
        signal += chord_wave * env * mask

    # Normalize and soften
    signal = signal / (np.max(np.abs(signal)) + 1e-6)
    
    # Fade in (2s) and Fade out (3s)
    fade_in = np.minimum(t / 2.0, 1.0)
    fade_out = np.minimum((duration - t) / 3.0, 1.0)
    signal = signal * fade_in * fade_out * 0.18 # -15dB ambient background
    
    # Save as 16-bit WAV
    audio_int16 = (signal * 32767).astype(np.int16)
    wav_path = os.path.join(AUDIO_DIR, "ambient_pad.wav")
    with wave.open(wav_path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int16.tobytes())
    print(f"Ambient music saved: {wav_path}")
    return wav_path

def mix_final_audio():
    print("Mixing voice clips and ambient music into final 90s audio track...")
    # Build ffmpeg filter_complex for exact delayed overlay
    # Input 0: ambient_pad.wav
    # Inputs 1..7: clip0..clip6
    cmd = ["ffmpeg", "-y", "-i", os.path.join(AUDIO_DIR, "ambient_pad.wav")]
    filter_inputs = []
    
    for idx, item in enumerate(VOICE_SCRIPTS):
        wav_file = os.path.join(AUDIO_DIR, f"{item['id']}.wav")
        cmd.extend(["-i", wav_file])
        delay_ms = int(item["time"] * 1000)
        filter_inputs.append(f"[{idx+1}:a]adelay={delay_ms}|{delay_ms},volume=1.35[v{idx}];")
    
    mix_line = "".join(filter_inputs)
    mix_sources = "".join([f"[v{i}]" for i in range(len(VOICE_SCRIPTS))])
    total_sources = len(VOICE_SCRIPTS) + 1
    
    # Mix ambient pad (0:a) with all voice clips
    filter_complex = f"{mix_line}[0:a]{mix_sources}amix=inputs={total_sources}:duration=first:dropout_transition=2,volume=1.2[outa]"
    cmd.extend(["-filter_complex", filter_complex, "-map", "[outa]"])
    cmd.extend(["-t", "90.00", "-ar", "44100", "-ac", "2", os.path.join(AUDIO_DIR, "final_soundtrack_90s.mp3")])
    
    subprocess.run(cmd, check=True)
    print(f"Final audio soundtrack created: {os.path.join(AUDIO_DIR, 'final_soundtrack_90s.mp3')}")

if __name__ == "__main__":
    generate_voice_clips()
    generate_ambient_music(90.0)
    mix_final_audio()
