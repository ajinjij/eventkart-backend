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

module.exports = router;
