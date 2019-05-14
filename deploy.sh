echo "Sending files to server"
rsync -arv --exclude-from='exclude_me.txt' -v -e ssh /home/dan/Production/server-1/apps/mellocloud/tic-tac-toe-backend/. deploy@10.0.0.201:/home/deploy/mellocloud/websocket

echo "Starting pm2 for MelloCloudAPI"
ssh deploy@10.0.0.201 << 'ENDSSH'
cd mellocloud/websocket
npm install
pm2 restart MelloCloudWebSocket
ENDSSH