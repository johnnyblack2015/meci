import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store connected users
  const users = new Map<string, { id: string; name: string; designation: string; roomNumber: string; isOnline: boolean }>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("register", (data: { name: string; designation: string; roomNumber: string; isOnline?: boolean }) => {
      users.set(socket.id, { 
        id: socket.id, 
        name: data.name, 
        designation: data.designation, 
        roomNumber: data.roomNumber,
        isOnline: data.isOnline !== false // Default to true
      });
      io.emit("users_update", Array.from(users.values()));
    });

    socket.on("update_status", (data: { isOnline: boolean }) => {
      const user = users.get(socket.id);
      if (user) {
        user.isOnline = data.isOnline;
        users.set(socket.id, user);
        io.emit("users_update", Array.from(users.values()));
      }
    });

    socket.on("call_user", (data: { targetId: string; callerName: string; callerDesignation: string; callerRoomNumber: string }) => {
      io.to(data.targetId).emit("incoming_call", {
        callerId: socket.id,
        callerName: data.callerName,
        callerDesignation: data.callerDesignation,
        callerRoomNumber: data.callerRoomNumber,
      });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      users.delete(socket.id);
      io.emit("users_update", Array.from(users.values()));
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
