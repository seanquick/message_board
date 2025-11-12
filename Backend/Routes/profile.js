// Backend/Routes/profile.js
const express = require('express');
const router = express.Router();
const User = require('../Models/User');

// GET /api/profile/:userId — Public view of a user profile
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();

    // 🔸 Guard: handle missing or private profiles
    if (!user || user.deletedAt || !user.profilePublic) {
      return res.status(404).json({ error: 'Profile not found or private' });
    }

    // 🔸 Safe public response payload (profilePhotoUrl removed)
    res.json({
      _id: user._id,
      name: user.name,
      displayName: user.displayName || '',
      bio: user.bio || '',
      favoriteQuote: user.favoriteQuote || '',
      email: user.emailPublic ? user.email : undefined,
      profilePublic: user.profilePublic
    });
  } catch (err) {
    console.error('[GET /api/profile/:userId] error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
