const mongo = require('mongodb').MongoClient;
const url = 'mongodb://tictacdan:1234@localhost:27017/tictactoe?authMechanism=SCRAM-SHA-1&authSource=tictactoe';

mongo.connect(url, { useNewUrlParser: true }, (err, client) => {
  if (err) {
    console.error(err)
    return;
  };
});