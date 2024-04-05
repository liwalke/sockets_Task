import express from 'express';
import { createServer } from 'node:http';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// open the database file
const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
});

// create our 'messages' table (you can ignore the 'client_offset' column for now)
await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
`);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/index.html'));
});

io.on('connection', async (socket) => {
    const user = socket.id.substring(0,5);

    console.log(`User ${socket.id} is connected!`);
    io.emit('connected', `User ${user} joined on chat`);

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} is disconnected!`);
        io.emit('disconnected', `User ${user} left`);
    });

    socket.on('message', async message => {
        message = `User ${user} said: ${message}`
        
        let result;
        try {
            result = await db.run('INSERT INTO messages (content) VALUES (?)', message);
        } catch (e) {
            io.emit('message', `Something went wrong! Messages from ${user} may was not delivered.`);
            return;
        }
        io.emit('message', message, result.lastID);
    });

    if (!socket.recovered) {
        try {
            await db.each('SELECT id, content FROM messages WHERE id > ?',
                [socket.handshake.auth.serverOffset || 0],
                (_err, row) => {
                    socket.emit('message', row.content, row.id);
                }
            )
        } catch (e) {
            io.emit('message', `Something went wrong! Messages from ${user} may was not delivered.`);
        }
    }
});

server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});