# Start here

This repository contains the **Community Studio Space Planner** app. Downloading the files puts them on your computer. Starting the app is a separate step.

## 1. Download the files

On this repository's GitHub page, click the green **Code** button above the file list, then click **Download ZIP**.

Find the ZIP in your computer's Downloads folder and extract/unzip it. The extracted folder will usually be called **KTM-CS-main**.

## 2. Install Node.js

Install **Node.js 24 or newer** from [nodejs.org](https://nodejs.org). Node.js is the program that runs this app.

## 3. Open a terminal in the extracted folder

- **Windows:** Open the extracted folder in File Explorer, click its address bar, type `powershell`, then press Enter.
- **Mac:** Open Terminal. Type `cd` followed by a space, drag the extracted folder into the Terminal window, then press Enter.

The terminal must be inside the folder containing `package.json`.

## 4. Start the app

On **Mac or Linux**, run these commands, one at a time:

```bash
npm ci
npm run dev
```

On **Windows PowerShell**, run:

```powershell
npm.cmd ci
npm.cmd run dev
```

The first command downloads the app's dependencies. The second starts it. Keep the terminal open while using the app.

## 5. Open it in your browser

On the **same computer**, open a browser and type `localhost:3000` into the address bar.

You should see **Community Studio — Space Planner**.

## 6. Try planning an activity

1. Enter an activity name.
2. Choose the activity type, people, dates and times.
3. Review the suggested zones. The initial 20-person workshop needs more area; scroll down the activity form and accept an offered adjoining zone.
4. Click **Save draft** to keep a proposal, or **Request this space** to make a pending reservation.
5. Open **All bookings** to see saved activities. The initial example bookings are labelled as demos.

Managers can use the lock icon to sign in. The first run creates a private password in `.data/manager-password` on the computer running the app. Keep it private. Verified site limits and an assessment reference are required before bookings can be confirmed.

The app saves bookings on the computer running it. Downloading this repository does **not** publish a public website. See [README.md](README.md) for the full setup, tests and provisional planning assumptions.
