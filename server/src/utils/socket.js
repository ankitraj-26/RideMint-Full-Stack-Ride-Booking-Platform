import { Server } from 'socket.io';

let ioInstance = null;

export const initializeSocket = (httpServer) => {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  ioInstance.on('connection', (socket) => {
    socket.on('register', ({ userId }) => {
      if (userId) {
        socket.join(`user:${String(userId)}`);
      }
    });

    socket.on('join-admin', () => {
      socket.join('admin-room');
    });
  });

  return ioInstance;
};

export const emitNotificationToUser = (userId, notification) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${String(userId)}`).emit('notification', notification);
};

export const emitNotificationToAdmins = (notification) => {
  if (!ioInstance) return;
  ioInstance.to('admin-room').emit('notification', notification);
};
