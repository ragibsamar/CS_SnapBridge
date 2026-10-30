CYBERSHOP SNAPBRIDGE
====================
Send photos and files from any phone to your PC/Mac instantly, and straighten
document photos with the built-in FlatScan tool.

FILES
-----
index.html    Page structure: nav bar, Transfer tab, FlatScan tab, dialogs
theme.css     All styling. Dark/Light tokens at the top, sections numbered 1-5
app.js        Main logic: radar, WebRTC transfers, auto-save, pairing, photo flow
transport.js  Signalling layer (one interface, two backends: claude.ai or server.js)
flatscan.js   FlatScan engine (corner detection, perspective flatten, scan filters)
server.js     Zero-dependency Node.js server for running on your own PC/LAN
README.txt    This file

Load order in index.html: transport.js -> flatscan.js -> app.js


OPTION A: RUN IT ON YOUR OWN PC/MAC (recommended, works offline on your Wi-Fi)
-------------------------------------------------------------------------------
Needs: Node.js 18 or newer (https://nodejs.org). No npm install needed.

1. Put all the files in one folder.
2. Open a terminal in that folder and run:   node server.js
3. The terminal prints two addresses, for example:
      On this PC/Mac :  http://localhost:3000
      On your phone  :  http://192.168.1.25:3000   (same Wi-Fi)
4. On the PC, open http://localhost:3000 in Chrome or Edge.
   (Use localhost on the PC: folder auto-save only works on localhost or https.)
5. Click "Pair device". A QR code and a 6-digit code appear.
6. On the phone (same Wi-Fi) scan the QR code, or open the phone address from step 3
   and type the 6-digit code under "Pair device".
7. The phone appears on the radar. Pick it as the target on the PC, or pick the
   PC on the phone, then use "Take photo" or "Send files".

Receiving files on the PC:
- First time: in the Received card click "Choose folder" and pick your Downloads
  folder. The app creates a "SnapBridge" folder inside it and saves every received
  file there automatically (Downloads > SnapBridge). The folder is remembered; after
  restarting the browser click "Resume" once.
- Without a folder, files fall back to the browser's normal Downloads folder.

If the phone cannot reach the PC: allow Node.js through the Windows Firewall
(Private networks), make sure both devices use the same Wi-Fi, and that guest or
"client isolation" Wi-Fi is off.

Change the port:   PORT=4000 node server.js        (Windows: set PORT=4000 && node server.js)

Optional HTTPS for phones: the phone's "Take photo" button works over plain http.
You only need HTTPS if you later add live in-page camera features (getUserMedia).


OPTION B: RUN IT INSIDE CLAUDE.AI
---------------------------------
Open the published page: https://claude.ai/artifact/JTHANBtJs3EnGHWfaeqPwq
Both devices must be signed in to claude.ai and able to open that link. Then use
Pair device exactly as above (scan the QR or enter the code). Files go directly
between devices; a 20 MB relay is used only if a direct link cannot be made.
Folder auto-save may be blocked inside claude.ai; use the Save button on each file
(common file types) or use Option A.


HOW IT WORKS (for development)
------------------------------
- Pairing: each device joins a "room" named by the 6-digit code (#join-123456 in the URL).
- Signalling: app.js sends WebRTC offer/answer/ICE messages with Transport.emit('sig', ...).
- Transfer: a WebRTC data channel carries the file in 16 KB chunks with back-pressure.
  Messages are JSON {t:'meta'|'end'|'cancel'} plus binary chunks.
- Fallback: if no direct channel opens within 10 s the file goes through Transport.relayUpload().
- Auto-save: Saver (in app.js) streams chunks into Downloads/SnapBridge using the
  File System Access API.
- Photo flow: "Take photo" -> dialog -> "Adjust with FlatScan" -> crop/straighten ->
  "Send to device".
- FlatScan: window.FlatScan = { load(file), hasResult(), blob(), format(), name(), refresh() }.

Adding another backend (for example a WebSocket server): copy the "sse" object in
transport.js and implement init/join/emit/presence/peers/myId/relayUpload/relayFetch/baseUrl.

Security notes: anyone who knows a 6-digit code can join that room, so close the Pair
dialog when not pairing and treat the code as temporary. Run the server only on trusted
networks. The server never stores files except the optional in-memory relay (10 min).


TROUBLESHOOTING
---------------
- "No live connection" banner: the server is not running or you opened index.html by
  double-click. Always open the http://... address printed by server.js.
- Devices do not appear: both must use the same 6-digit code (see the Pair dialog).
- Transfer stuck on "Direct link unavailable": check firewall/VPN, or rely on the relay.
- No auto-save option: use Chrome or Edge on desktop
