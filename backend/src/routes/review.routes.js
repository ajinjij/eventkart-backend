const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// POST /api/reviews
// Customer: leave a review on a completed booking. Recomputes the vendor's
// average rating so their profile and listing cards stay up to date.
router.post("/", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  if (!bookingId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "bookingId and a rating from 1 to 5 are required" });
  }

  const booking = await prisma.booking.findUnique({ where: { id: Number(bookingId) } });
  if (!booking || booking.customerId !== req.user.id) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "COMPLETED") {
    return res.status(400).json({ error: "You can only review a completed booking" });
  }

  const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    return res.status(409).json({ error: "You have already reviewed this booking" });
  }

  const review = await prisma.review.create({
    data: { bookingId: booking.id, customerId: req.user.id, rating: Number(rating), comment },
  });

  // Recompute the vendor's running average rating.
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: booking.vendorId } });
  const newCount = vendor.reviewCount + 1;
  const newRating = Number((((vendor.rating * vendor.reviewCount) + Number(rating)) / newCount).toFixed(2));
  await prisma.vendorProfile.update({
    where: { id: vendor.id },
    data: { rating: newRating, reviewCount: newCount },
  });

  res.status(201).json(review);
});

// GET /api/reviews/vendor/:vendorId
// Public: list reviews for a vendor's profile page.
router.get("/vendor/:vendorId", async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { booking: { vendorId: Number(req.params.vendorId) } },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(reviews);
});

module.exports = router;
