const express = require('express');
const router = express.Router();
const User   = require('../Models/User');
const { requireAuth } = require('../Middleware/auth');

// ===== GET OWN PROFILE =====
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.uid).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      _id:           user._id,
      name:          user.name,
      displayName:   user.displayName || '',
      bio:           user.bio || '',
      favoriteQuote: user.favoriteQuote || '',
      profilePublic: user.profilePublic === true,
      emailPublic:   user.emailPublic === true,
      email:         user.emailPublic === true ? user.email : undefined
    });
  } catch (err) {
    console.error('[GET /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ===== UPDATE OWN PROFILE =====
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const {
      displayName = '',
      bio = '',
      favoriteQuote = '',
      profilePublic = false,
      emailPublic = false
    } = req.body;

    const updates = {
      displayName: displayName.trim(),
      bio: bio.trim(),
      favoriteQuote: favoriteQuote.trim(),
      profilePublic: !!profilePublic,
      emailPublic: !!emailPublic
    };

    const user = await User.findByIdAndUpdate(req.user.uid, updates, { new: true, lean: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      profile: {
        _id:           user._id,
        displayName:   user.displayName,
        bio:           user.bio,
        favoriteQuote: user.favoriteQuote,
        profilePublic: user.profilePublic === true,
        emailPublic:   user.emailPublic === true,
        email:         user.emailPublic === true ? user.email : undefined
      }
    });
  } catch (err) {
    console.error('[POST /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===== PUBLIC PROFILE VIEW =====
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user || user.deletedAt) return res.status(404).json({ error: 'User not found' });

    const requesterId = req.user?.uid;
    if (!user.profilePublic && String(requesterId) !== String(user._id)) {
      return res.status(403).json({ error: 'Profile is private' });
    }

    const resp = {
      _id:           user._id,
      name:          user.name,
      displayName:   user.displayName || '',
      bio:           user.bio || '',
      favoriteQuote: user.favoriteQuote || ''
    };

    if (user.profilePublic && user.emailPublic) {
      resp.email = user.email;
    }

    res.json(resp);
  } catch (err) {
    console.error('[GET /users/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ===== LIST ALL (PUBLIC) PROFILES =====
router.get('/', async (req, res) => {
  try {
    const users = await User.find(
      { profilePublic: true },
      { _id: 1, name: 1, displayName: 1 }
    ).lean();

    const list = users.map(u => ({
      _id:        u._id,
      name:       u.name,
      displayName: u.displayName || u.name
    }));

    res.json({ users: list });
  } catch (err) {
    console.error('[GET /users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

module.exports = router;
