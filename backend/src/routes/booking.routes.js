const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/bookings/mine
// Returns bookings for the logged-in customer or vendor.
router.get("/mine", requireAuth, async (req, res) => {
  let where;
  if (req.user.role === "CUSTOMER") {
    where = { customerId: req.user.id };
  } else if (req.user.role === "VENDOR") {
    const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } });
    where = { vendorId: vendor.id };
  } else {
    return res.status(403).json({ error: "Admins should use /api/admin/bookings" });
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: { payment: true, vendor: true, quote: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(bookings);
});

// GET /api/bookings/:id
router.get("/:id", requireAuth, async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: Number(req.params.id) },
    include: { payment: true, vendor: true, quote: true, review: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const vendor = req.user.role === "VENDOR" ? await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } }) : null;
  const owns = booking.customerId === req.user.id || (vendor && booking.vendorId === vendor.id) || req.user.role === "ADMIN";
  if (!owns) return res.status(403).json({ error: "You do not have access to this booking" });

  res.json(booking);
});

// POST /api/bookings/:id/complete
// Vendor: mark the event as delivered. This is what allows escrow funds to be released.
router.post("/:id/complete", requireAuth, requireRole("VENDOR"), async (req, res) => {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: req.user.id } });
  const booking = await prisma.booking.findUnique({ where: { id: Number(req.params.id) } });
  if (!booking || booking.vendorId !== vendor.id) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "CONFIRMED") {
    return res.status(400).json({ error: "Only a confirmed, paid booking can be marked complete" });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "COMPLETED" },
  });
  res.json(updated);
});

// POST /api/bookings/:id/dispute
// Customer or vendor: flag a booking for admin review.
router.post("/:id/dispute", requireAuth, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "A dispute reason is required" });

  const booking = await prisma.booking.findUnique({ where: { id: Number(req.params.id) } });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "DISPUTED", disputeReason: reason },
  });
  res.json(updated);
});

module.exports = router;
