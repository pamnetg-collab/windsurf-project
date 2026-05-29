import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "admin12345";

  // Bootstrap admin
  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.admin.create({ data: { email, passwordHash } });
    console.log(`Created admin: ${email}`);
  } else {
    console.log(`Admin already exists: ${email}`);
  }

  // Demo servers are intentionally NOT seeded: they would hand out non-working
  // VPN keys. Add real 3x-ui servers via the admin panel (Servers -> Add).
  // To seed demo servers for local development, set SEED_DEMO_SERVERS=true.
  if (process.env.SEED_DEMO_SERVERS === "true") {
    const count = await prisma.server.count();
    if (count === 0) {
      await prisma.server.createMany({
        data: [
          {
            name: "demo-1",
            ip: "10.0.0.1",
            port: 443,
            region: "DEMO",
            capacity: 100,
            currentUsers: 0,
            status: "active",
            sni: "www.cloudflare.com",
            publicKey: "demo_public_key_1",
          },
        ],
      });
      console.log("Seeded demo server (dev only)");
    }
  } else {
    console.log("Skipping demo servers (add real 3x-ui servers in the admin panel)");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
