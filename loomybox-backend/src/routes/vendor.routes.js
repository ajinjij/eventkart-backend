const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/vendors?category=wedding&city=Mumbai
// Public: browse approved vendors, optionally filtered.
router.get("/", async (req, res) => {
  const { category, city } = req.query;
  const vendors = await prisma.vendorProfile.findMany({
    where: {
      status: "APPROVED",
      ...(category ? { category: String(category) } : {}),
      ...(city ? { city: String(city) } : {}),
    },
    include: { packages: true },
    orderBy: { rating: "desc" },
  });
  res.json(vendors);
});

// GET /api/vendors/:id
// Public: full profile with packages, for the vendor profile page.
router.get("/:id", async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: Number(req.params.id) },
    include: { packages: true },
  });
  if (!vendor || vendor.status !== "APPROVED") {
    return res.status(404).json({ error: "Vendor not found" });
  }
  res.json(vendor);
});

// PUT /api/vendors/me
// Vendor: update their own profile (business name, category, city, description).
router.put("/me", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const { businessName, category, city, description } = req.body;
  const vendor = await prisma.vendorProfile.update({
    where: { userId: req.user.id },
    data: { businessName, category, city, description },
  });
  res.json(vendor);
});

// GET /api/vendors/me/profile
// Vendor: fetch their own profile, including pending/rejected status.
router.get("/me/profile", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { userId: req.user.id },
    include: { packages: true },
  });
  res.json(vendor);
});

// POST /api/vendors/me/packages
// Vendor: add a package (e.g. "Signature package", ₹2,20,000).
// imageUrl can be a data URL (base64) sent by the frontend after reading a
// local file, which works fine for a demo without needing S3/Cloudinary set up.
router.post("/me/packages", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const { name, description, price, originalPrice, imageUrl } = req.body;
  if (!name || price == null) {
    return res.status(400).json({ error: "name and price are required" });
  }
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } });
  const pkg = await prisma.package.create({
    data: {
      vendorId: vendor.id,
      name,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : null,
      imageUrl,
    },
  });
  res.status(201).json(pkg);
});

// PUT /api/vendors/me/packages/:packageId
// Vendor: edit an existing package's name, description, price, or image.
router.put("/me/packages/:packageId", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } });
  const pkg = await prisma.package.findUnique({ where: { id: Number(req.params.packageId) } });
  if (!pkg || pkg.vendorId !== vendor.id) {
    return res.status(404).json({ error: "Package not found" });
  }

  const { name, description, price, originalPrice, imageUrl } = req.body;
  const updated = await prisma.package.update({
    where: { id: pkg.id },
    data: {
      name: name !== undefined ? name : pkg.name,
      description: description !== undefined ? description : pkg.description,
      price: price !== undefined ? Number(price) : pkg.price,
      originalPrice: originalPrice !== undefined ? (originalPrice ? Number(originalPrice) : null) : pkg.originalPrice,
      imageUrl: imageUrl !== undefined ? imageUrl : pkg.imageUrl,
    },
  });
  res.json(updated);
});

// DELETE /api/vendors/me/packages/:packageId
router.delete("/me/packages/:packageId", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } });
  const pkg = await prisma.package.findUnique({ where: { id: Number(req.params.packageId) } });
  if (!pkg || pkg.vendorId !== vendor.id) {
    return res.status(404).json({ error: "Package not found" });
  }
  await prisma.package.delete({ where: { id: pkg.id } });
  res.status(204).send();
});

module.exports = router;
