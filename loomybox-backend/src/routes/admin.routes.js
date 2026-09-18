const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Every route in this file is admin-only.
router.use(requireAuth, requireRole("ADMIN"));

// GET /api/admin/vendors/pending
router.get("/vendors/pending", async (req, res) => {
  const vendors = await prisma.vendorProfile.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { name: true, email: true, createdAt: true } } },
  });
  res.json(vendors);
});

// POST /api/admin/vendors/:id/approve
router.post("/vendors/:id/approve", async (req, res) => {
  const vendor = await prisma.vendorProfile.update({
    where: { id: Number(req.params.id) },
    data: { status: "APPROVED" },
  });
  res.json(vendor);
});

// POST /api/admin/vendors/:id/reject
router.post("/vendors/:id/reject", async (req, res) => {
  const vendor = await prisma.vendorProfile.update({
    where: { id: Number(req.params.id) },
    data: { status: "REJECTED" },
  });
  res.json(vendor);
});

// GET /api/admin/bookings/disputed
router.get("/bookings/disputed", async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { status: "DISPUTED" },
    include: { customer: { select: { name: true, email: true } }, vendor: true, payment: true },
  });
  res.json(bookings);
});

// GET /api/admin/stats
// Powers the admin dashboard cards: commission earned, active bookings, open disputes.
router.get("/stats", async (req, res) => {
  const [commissionAgg, activeBookings, openDisputes] = await Promise.all([
    prisma.booking.aggregate({
      _sum: { commissionAmount: true },
      where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    }),
    prisma.booking.count({ where: { status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.booking.count({ where: { status: "DISPUTED" } }),
  ]);

  res.json({
    totalCommission: commissionAgg._sum.commissionAmount || 0,
    activeBookings,
    openDisputes,
  });
});

// GET /api/admin/coupons
router.get("/coupons", async (req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  res.json(coupons);
});

// POST /api/admin/coupons
// Body: { code, type: "PERCENT"|"FLAT", value, minOrder?, maxUses?, expiresAt? }
router.post("/coupons", async (req, res) => {
  const { code, type, value, minOrder, maxUses, expiresAt } = req.body;
  if (!code || !type || value == null) {
    return res.status(400).json({ error: "code, type, and value are required" });
  }
  if (!["PERCENT", "FLAT"].includes(type)) {
    return res.status(400).json({ error: "type must be PERCENT or FLAT" });
  }

  try {
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: Number(value),
        minOrder: minOrder ? Number(minOrder) : null,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "A coupon with this code already exists" });
    throw err;
  }
});

// PATCH /api/admin/coupons/:id
// Toggle a coupon active/inactive rather than deleting it, so past bookings keep an accurate record.
router.patch("/coupons/:id", async (req, res) => {
  const { active } = req.body;
  const coupon = await prisma.coupon.update({
    where: { id: Number(req.params.id) },
    data: { active: Boolean(active) },
  });
  res.json(coupon);
});

// GET /api/admin/settings
// Same shape as the public /api/settings, but admin-only so the settings page can show current values to edit.
router.get("/settings", async (req, res) => {
  const rows = await prisma.setting.findMany();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

// PUT /api/admin/settings
// Body: { key: value, key2: value2, ... } - upserts each setting provided.
// This is what lets the admin change site branding/copy without touching code.
router.put("/settings", async (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: "No settings provided" });

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  const rows = await prisma.setting.findMany();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

module.exports = router;
