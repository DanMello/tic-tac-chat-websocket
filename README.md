# tic-tac-toe-WebSocket

# Play now

[https://mellocloud.com/tic-tac-chat](https://mellocloud.com/tic-tac-chat)

# What I learned in the Back-end of this project.

1. Learned how to securely setup websockets, using nginx to reroute traffic from wss://mellocloud.com/ws to another node js app running the websocket with the https keys.

2. Learned how to create and handle different events with websockets and decide what to do accordingly.

3. Learned how to setup a Client ID on the ws object so I can identify who is using the websocket.

4. Learned how to setup mongoDB in a different file and extract out each type of query individually using dependency injection and closures. This just makes it easier for me to use the query's and have it be promise based. If you look at the mongodb.js and index.js file you will see.

5. Learned to broadcast messages to all or certain users in the websocket.

## View Front-end

[https://github.com/DanMello/tic-tac-chat](https://github.com/DanMello/tic-tac-chat)
