const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.12);

// Every route here is for a logged-in customer building/checking out their cart.
router.use(requireAuth, requireRole("CUSTOMER"));

/**
 * Fetches the customer's cart, creating an empty one on first use so the
 * frontend never has to special-case "no cart yet".
 */
async function getOrCreateCart(customerId) {
  let cart = await prisma.cart.findUnique({
    where: { customerId },
    include: { items: { include: { package: { include: { vendor: true } } } } },
  });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { customerId },
      include: { items: { include: { package: { include: { vendor: true } } } } },
    });
  }
  return cart;
}

// GET /api/cart
router.get("/", async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  res.json(cart);
});

// POST /api/cart/items
// Body: { packageId, eventDate?, notes? }
router.post("/items", async (req, res) => {
  const { packageId, eventDate, notes } = req.body;
  if (!packageId) return res.status(400).json({ error: "packageId is required" });

  const pkg = await prisma.package.findUnique({ where: { id: Number(packageId) }, include: { vendor: true } });
  if (!pkg || pkg.vendor.status !== "APPROVED") {
    return res.status(404).json({ error: "Package not found" });
  }

  const cart = await getOrCreateCart(req.user.id);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_packageId: { cartId: cart.id, packageId: pkg.id } },
  });
  if (existing) {
    return res.status(409).json({ error: "This package is already in your cart" });
  }

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      packageId: pkg.id,
      eventDate: eventDate ? new Date(eventDate) : null,
      notes,
    },
    include: { package: { include: { vendor: true } } },
  });
  res.status(201).json(item);
});

// PUT /api/cart/items/:itemId
// Update the event date/notes for a cart item (e.g. before checkout).
router.put("/items/:itemId", async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  const item = cart.items.find((i) => i.id === Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: "Cart item not found" });

  const { eventDate, notes } = req.body;
  const updated = await prisma.cartItem.update({
    where: { id: item.id },
    data: {
      eventDate: eventDate ? new Date(eventDate) : item.eventDate,
      notes: notes !== undefined ? notes : item.notes,
    },
    include: { package: { include: { vendor: true } } },
  });
  res.json(updated);
});

// DELETE /api/cart/items/:itemId
router.delete("/items/:itemId", async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  const item = cart.items.find((i) => i.id === Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: "Cart item not found" });

  await prisma.cartItem.delete({ where: { id: item.id } });
  res.status(204).send();
});

// POST /api/cart/checkout
// Turns every item in the cart into a booking and captures payment for all of
// them in one go - the "Buy Now" moment. In production, swap the payment
// capture block for a real gateway call and only mark bookings CONFIRMED
// once the gateway confirms the charge.
router.post("/checkout", async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  if (cart.items.length === 0) {
    return res.status(400).json({ error: "Your cart is empty" });
  }

  const createdBookings = [];
  let grandTotal = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of cart.items) {
      const commissionAmount = Number((item.package.price * COMMISSION_RATE).toFixed(2));
      const totalAmount = Number((item.package.price + commissionAmount).toFixed(2));

      const booking = await tx.booking.create({
        data: {
          packageId: item.packageId,
          customerId: req.user.id,
          vendorId: item.package.vendorId,
          totalAmount,
          commissionAmount,
          eventDate: item.eventDate,
          status: "CONFIRMED", // paid immediately, see note above about real gateways
        },
      });
      await tx.payment.create({
        data: { bookingId: booking.id, amountPaid: totalAmount, status: "HELD" },
      });

      createdBookings.push(booking);
      grandTotal += totalAmount;
    }

    // Empty the cart now that everything in it has become a real booking.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  });

  res.status(201).json({
    message: `${createdBookings.length} booking(s) confirmed`,
    totalPaid: Number(grandTotal.toFixed(2)),
    bookings: createdBookings,
  });
});

module.exports = router;
