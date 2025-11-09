# Work Tracker

Work Tracker is a lightweight desktop application built with Electron.js. It helps you track your ongoing tasks with automatic prompts every few minutes, manage settings, and maintain daily backup files to avoid data loss.

## Features

- ✅ Automatic task prompt every configured time interval  
- ✅ System notifications  
- ✅ Always-on-top popup prompt  
- ✅ Daily backup file creation and update  
- ✅ Settings panel with delay configuration and backup folder selection  
- ✅ Clean, minimal UI  
- ✅ Cross-platform support (Windows, Linux, macOS)

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/Bhavan23/work-tracker.git
cd work-tracker
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the application
```bash
npm start
```

## How It Works

### Task Reminder Loop
- The app displays a reminder popup every 15 minutes (configurable).
- The popup asks: **“What are you currently working on?”**
- Your response is stored immediately.

### Backup Logic
- A single backup file is created per day.
- Multiple responses from the same day append to the same file.
- Backup files are stored in a dedicated folder inside the app directory by default.

### Settings Page
- You can modify:
  - Reminder interval (in minutes)
  - Backup folder location
- Changes are saved instantly.

## Troubleshooting

### Electron missing dependencies (Linux)
Install required libraries:
```bash
sudo apt install -y libnss3 libnspr4 libasound2 libgtk-3-0 libx11-6
```

## Development

### Project Structure
```
work-tracker/
│── main.js
│── preload.js
│── renderer.js
│── index.html
│── style.css
│── config.json
│── backups/
|── data/
│── package.json
```

## License
MIT License.
