const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3003 });

let counter = 0;
let users = [];

function broadcast(data,roomId) {
  const clients = Array.from(wss.clients)
    .filter(client => client.room === roomId)

  clients.forEach(function each(client) {
    client.send(data);
  });
};

function findRoom(roomId) {
  const room = Array.from(wss.clients)
    .filter(client => client.room === roomId)
  
  if (room.length > 0) {
    if (room.length > 1) {
      return new Error('Sorry that room is full.');
    };
  } else {
    return new Error('Cannot find room with that ID');
  };
};

wss.on('connection', function connection(ws) { 

  ws.on('message', function incoming(message) {

    const msg = JSON.parse(message);
    let serverMsg

    switch(msg.type) {
      case "createGame":
        ws.room = 'room' + ++counter;
        serverMsg = {
          type: "createGame",
          room: ws.room,
          player: 'X',
          name: msg.playerName
        };
        users = users.concat([{
          player: serverMsg.player,
          name: serverMsg.name,
          room: serverMsg.room
        }]);
        ws.send(JSON.stringify(serverMsg))
        break;
      case "joinGame":
        let checkRoom = findRoom(msg.room)
        if (checkRoom instanceof Error) {
          serverMsg = {
            type: "error",
            message: checkRoom.message,
            room: msg.room
          };
          ws.send(JSON.stringify(serverMsg));
        } else {
          ws.room = msg.room;
          serverMsg = {
            type: "joinGame",
            room: msg.room,
            player: 'O',
            name: msg.name
          };
          users = users.concat([{
            player: serverMsg.player,
            name: serverMsg.name,
            room: serverMsg.room
          }]);
          let filteredUsers = users.filter(user => user.room === msg.room);
          let serverBroadcast = {
            type: "notifyAllUsers",
            users: filteredUsers
          };
          ws.send(JSON.stringify(serverMsg));
          broadcast(JSON.stringify(serverBroadcast), msg.room);  
        };
        break;
      case "updateSquares":
        serverMsg = {
          type: "updateSquares",
          index: msg.index
        };
        broadcast(JSON.stringify(serverMsg), msg.room);
        break;
    };
  });
});

