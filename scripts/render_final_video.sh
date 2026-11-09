#!/usr/bin/env bash
set -e

RAW_VIDEO_FILE=$(cat /home/thinh/ca-nhan/tactic/recordings/latest_raw_video.txt)
AUDIO_FILE="/home/thinh/ca-nhan/tactic/recordings/audio/final_soundtrack_90s.mp3"
OUTPUT_MP4="/home/thinh/ca-nhan/tactic/tactic_demo_1m30s.mp4"
PUBLIC_MP4="/home/thinh/ca-nhan/tactic/demo-video.mp4"

echo "Merging raw video [$RAW_VIDEO_FILE] with soundtrack [$AUDIO_FILE]..."

ffmpeg -y \
  -i "$RAW_VIDEO_FILE" \
  -i "$AUDIO_FILE" \
  -map 0:v:0 \
  -map 1:a:0 \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -pix_fmt yuv420p \
  -r 30 \
  -c:a aac \
  -b:a 192k \
  -ar 44100 \
  -t 90.00 \
  -movflags +faststart \
  "$OUTPUT_MP4"

cp "$OUTPUT_MP4" "$PUBLIC_MP4"

echo "=========================================================="
echo "✅ Video demo hoàn tất thành công!"
echo "File chính: $OUTPUT_MP4"
echo "File public: $PUBLIC_MP4"
echo "Kích thước: $(ls -lh "$OUTPUT_MP4" | awk '{print $5}')"
echo "Thời lượng: 90.00 giây (01:30)"
echo "=========================================================="
