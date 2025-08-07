import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

// Test the client on initialization
if (prisma) {
  console.log("Prisma client initialized successfully");
  console.log("Available models:", Object.keys(prisma));
} else {
  console.error("Failed to initialize Prisma client");
}

export default prisma;
