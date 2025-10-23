#!/bin/bash

# Install FFmpeg if not already installed
if ! command -v ffmpeg &> /dev/null
then
    echo "FFmpeg not found, installing..."
    apt-get update
    apt-get install -y ffmpeg
    echo "FFmpeg installed successfully!"
else
    echo "FFmpeg already installed"
    ffmpeg -version
fi

# Install Node.js dependencies
npm install

echo "Build completed!"
