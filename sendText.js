const nodemailer = require('nodemailer');
const settings = {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
};
const transporter = nodemailer.createTransport(settings);
const send = function(body, token) {
  const carriers = ['txt.att.net', 'tmomail.net', 'vtext.com', 'messaging.sprintpcs.com'];
  const isnum = /^\d{10}$/.test(body.recipient);
  return new Promise((resolve, reject) => {
    if (isnum) {
      carriers.forEach(carrier => {
        const textMessage = {
          from: `${body.name} <${process.env.EMAIL}>`,
          to: `${body.recipient}@${carrier}`,
          text: `${body.url}/tic-tac-chat?gameId=${body.gameId}&token=${token}. You have been invited to play Tic-Tac-Chat.`
        };
        transporter.sendMail(textMessage, (err) => {
          if (err) {
            reject(err);
          };
        });
      });
      resolve();
    } else {
      const email = {
        from: `${body.name} <${process.env.EMAIL}>`,
        to: `${body.recipient}`,
        text: `${body.url}/tic-tac-chat?gameId=${body.gameId}&token=${token}. You have been invited to play Tic-Tac-Chat.`
      };
      transporter.sendMail(email, (err) => {
        if (err) {
          reject(err);
        };
        resolve();
      });
    };
  });
};

module.exports = {
  send
};