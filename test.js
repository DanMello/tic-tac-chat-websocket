require('dotenv').config()
const { find, findOne, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany } = require('./mongodb');
const ObjectId = require('mongodb').ObjectId;
const crypto = require('crypto');
const token = crypto.randomBytes(12).toString('hex');

deleteMany({});

insertOne({
  roomName: 'Dans Room',
  date: Date.now(),
  madeAt: new Date,
  rematch: [],
  players: [
    { username: 'Dan', move: 'X', clientID: '5678', host: true },
    { username: 'Steve', move: 'O', clientID: '1234', host: true }
  ],
  chat: [],
  tokens: [{clientID: '1234', token: '0000'}]
}).then(result => {
  let id = result.insertedId;

  updateMany({ "_id": ObjectId(id) }, 
    {
      $push:
      {
        "players": { username: 'Dan' }
      },
      $set:
      {
        "madeAt": 1
      }
  }).then(result => {
    
    find({}).then(data => console.log(JSON.stringify(data, null, 2)))
  })
});


// const test = function() {

//   insertOne({
//     roomName: 'Dans Room',
//     date: Date.now(),
//     rematch: [],
//     players: [
//       { username: 'Dan', move: 'X', clientID: '5678', host: true },
//       { username: 'Steve', move: 'O', clientID: '1234', host: true }
//     ],
//     chat: [],
//     tokens: [{clientID: '1234', token: '0000'}]
//   }).then(async (result) => {

//     let id = result.insertedId;

//     await updateOne({"_id": ObjectId(id), "tokens.clientID": '1234', "tokens.token": '0000'},
//     {
//       $pull:
//       {
//         "tokens": { clientID: '1234', token: '0000'}
//       }
//     });
    
//     find({}).then(data => console.log(JSON.stringify(data, null, 2)))
//   })

// };

// test();