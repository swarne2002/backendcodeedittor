// server.js
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server);

const usersInRooms = {};
const roomCodes = {}; // Object to store room codes

function addUserToRoom(socketId, roomId, username) {
    if (!usersInRooms[roomId]) {
        usersInRooms[roomId] = [];
    }
    usersInRooms[roomId].push({
        socketId,
        username
    });
}

function removeUserFromRoom(socketId, roomId) {
    if (usersInRooms[roomId]) {
        usersInRooms[roomId] = usersInRooms[roomId].filter(user => user.socketId !== socketId);
        if (usersInRooms[roomId].length === 0) {
            delete usersInRooms[roomId];
            delete roomCodes[roomId]; // Remove code when no users are in the room
        }
    }
}

function getConnectedClients(roomId) {
    return usersInRooms[roomId] || [];
}

io.on('connection', (socket) => {
    socket.on('join', ({ roomId, username }) => {
        addUserToRoom(socket.id, roomId, username);
        socket.join(roomId);
        const clients = getConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit('joined', {
                clients,
                username,
                socketId: socket.id
            });
        });

        // Send code to new user or fetch existing code for the room
        if (roomCodes[roomId]) {
            socket.emit('codeReceive', { code: roomCodes[roomId] });
        }
    });

    socket.on('disconnecting', () => {
        const rooms = socket.rooms;
        rooms.forEach(roomId => {
            const clients = getConnectedClients(roomId);
            clients.forEach(({ socketId }) => {
                if (socketId !== socket.id) {
                    io.to(socketId).emit('disconnected', {
                        socketId: socket.id,
                        username: usersInRooms[roomId].find(user => user.socketId === socket.id).username
                    });
                }
            });
            removeUserFromRoom(socket.id, roomId);
            io.to(roomId).emit('userList', { updatedUserList: getConnectedClients(roomId) }); // Emit updated user list
        });
    });

    socket.on('leave', ({ roomId }) => {
        socket.leave(roomId);
        removeUserFromRoom(socket.id, roomId);
        io.to(roomId).emit('userList', { updatedUserList: getConnectedClients(roomId) }); // Emit updated user list
    });

    socket.on('codeChange', ({ roomId, code }) => {
        const clients = getConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            socket.to(socketId).emit('codeChange', { code });
        });
        roomCodes[roomId] = code; // Update the code for the room
    });

    // Handle fetching code for room
    socket.on('getCode', ({ roomId }) => {
        if (roomCodes[roomId]) {
            socket.emit('codeReceive', { code: roomCodes[roomId] });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
