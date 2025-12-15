#!/bin/bash
# Run these commands to push via git (if you prefer command line)

cd /Users/isaac.boruchowicz/Library/CloudStorage/OneDrive-Ogilvy/Desktop/Cursor/MrPDF/github

# Initialize git (if not already)
git init

# Add remote
git remote add origin https://github.com/dodisworking/MrPDFMaker.git

# Add all files
git add .

# Commit
git commit -m "Initial commit: MrPDF converter"

# Push
git branch -M main
git push -u origin main
