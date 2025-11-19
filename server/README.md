# Week5 Socket.io Server (Demo)

Run:
1. cd server
2. npm install
3. npm run dev

API:
POST /login { username } -> { token, userId, username }

Socket.io:
- Connect with auth token: io(url, { auth: { token } })
- Events handled: load-messages, new-message, private-message, typing, mark-read, add-reaction, online-users
