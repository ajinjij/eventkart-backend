// Creates a default admin account so you have someone who can approve
// vendors and manage disputes right after setup.
// Run with: npm run seed

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "admin@eventkart.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin account already exists:", email);
    return;
  }

  const password = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: { name: "Platform Admin", email, password, role: "ADMIN" },
  });

  console.log("Admin account created:");
  console.log("  email:    admin@eventkart.com");
  console.log("  password: admin123");
  console.log("Change this password before deploying anywhere real.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
