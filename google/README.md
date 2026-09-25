# Google Sync setup (about 5 minutes)

Google Sync keeps your projects and clients in a **Google Sheet** and your photos and logos in
**Google Drive**, so the app shows the same work on every phone and computer. It runs on a small
Google Apps Script that lives in your own Google account. No one else hosts or sees your data.

You only do this once. Every device then connects with the same **web app URL** and **secret key**.

## 1. Create the Sheet and add the script

1. Open [sheets.new](https://sheets.new) (signed in to the Google account you want to use) and name the
   spreadsheet **Project Spotlight**.
2. In the menu choose **Extensions → Apps Script**.
3. Delete everything in the `Code.gs` editor and paste in the entire contents of
   [`google/Code.gs`](./Code.gs) ([raw file](https://raw.githubusercontent.com/msalty/projectspotlight/main/google/Code.gs)).
4. Click the **Save** (disk) icon. Rename the project to "Project Spotlight Sync" if you like.

## 2. Run setup once

1. In the toolbar, pick **`setup`** from the function drop-down and click **Run**.
2. Google asks for permission:
   - **Review permissions** → choose your account.
   - You'll see "Google hasn't verified this app". That's expected, because it's your own script. Click
     **Advanced → Go to Project Spotlight Sync (unsafe)** → **Allow**.
   - The script needs access to Sheets (to store projects) and Drive (to store photos).
3. When it finishes, the **Execution log** shows **Your secret key**. Copy it and keep it somewhere
   safe, such as a password manager. If you lose it, you can find it again under **Project Settings (gear
   icon) → Script Properties → `TOKEN`**.

Setup adds the tabs **Projects**, **Clients** and **Files** to your Sheet, and creates a Drive
folder **Project Spotlight** with **Photos** and **Graphics** subfolders.

## 3. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

"Anyone" lets the app reach the script without a Google sign-in on every device. Every request must
still include your secret key, and anything without it is rejected.

## 4. Connect the app

On each phone or computer:

1. Open Project Spotlight → **Settings → Google Sync**.
2. Paste the **Web app URL** and **Secret key**, then tap **Connect**.

The first sync uploads everything on that device. Other devices download it when they connect.
After that, changes sync automatically: a few seconds after you edit, when the app opens, and when
the device comes back online. The cloud button on the Projects screen syncs on demand.

## How it behaves

- **Last edit wins.** If the same project is edited on two devices, the most recent edit is kept.
- **Deletes sync too.** Deleted projects stay in the Sheet with `deleted` = TRUE so other devices
  remove them. Their photos stay in Drive, so you can clean those up by hand if you want.
- **Offline works.** Edits made offline sync the next time the device is online.
- **The Sheet is readable.** Title, client, category, location, description and photo links are
  filled in for browsing. The `json` column is what the app actually uses. Don't edit it, and expect
  the other columns to be overwritten on the next sync.
- **Save to Google Drive** in the Share tab puts finished graphics in the **Graphics** folder.

## Updating the script later

If a new version of `Code.gs` is released, paste it in, save, then **Deploy → Manage deployments →
✏️ Edit → Version: New version → Deploy**. This keeps the same URL, so the devices don't need changes.

## Security

- Keep the URL and secret key private. Together they give access to your Project Spotlight data.
- To change the key, run **`resetSecretKey`** in the Apps Script editor, then reconnect each device
  with the new key.
- To stop syncing entirely, delete the deployment (**Deploy → Manage deployments → Archive**).

## Troubleshooting

| Message in the app | Fix |
| --- | --- |
| *Wrong secret key* | Re-copy the key from the execution log or Script Properties → `TOKEN`. |
| *Unexpected reply from Google* | The deployment's access must be **Anyone**, and the URL must end in `/exec`, not `/dev`. |
| *Could not reach Google* | Check the URL and your connection. |
| Changes don't appear on another device | Tap the cloud button on the Projects screen, or **Sync now** in Settings. |
