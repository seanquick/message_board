// Backend/Routes/user.js
const express = require('express');
const router = express.Router();
const User   = require('../Models/User');
const { requireAuth } = require('../Middleware/auth');

// ✅ Import upload handlers
const { uploadSingle, processAndUpload } = require('../Services/uploadPhoto');

// ===== GET OWN PROFILE =====
// GET /api/users/profile — Return the authenticated user’s full profile (including private fields)
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.uid).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id:           user._id,
      name:          user.name,
      displayName:   user.displayName  || '',
      bio:           user.bio          || '',
      favoriteQuote: user.favoriteQuote|| '',
      profilePhoto:  user.profilePhotoUrl || user.profilePhoto || '/default-avatar.png',
      profilePublic: user.profilePublic === true,
      emailPublic:   user.emailPublic   === true,
      email:         user.emailPublic   === true ? user.email : undefined
    });
  } catch (err) {
    console.error('[GET /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ===== UPDATE OWN PROFILE =====
// POST /api/users/profile — Authenticated user updates their own profile info & privacy flags
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const {
      displayName   = '',
      bio           = '',
      favoriteQuote = '',
      profilePhoto  = '',
      profilePublic = false,
      emailPublic   = false
    } = req.body;

    const updates = {
      displayName:   displayName.trim(),
      bio:           bio.trim(),
      favoriteQuote: favoriteQuote.trim(),
      profilePhoto:  profilePhoto.trim(),
      profilePublic: !!profilePublic,
      emailPublic:   !!emailPublic
    };

    const user = await User.findByIdAndUpdate(
      req.user.uid,
      updates,
      { new: true, lean: true }
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      profile: {
        _id:           user._id,
        displayName:   user.displayName,
        bio:           user.bio,
        favoriteQuote: user.favoriteQuote,
        profilePhoto:  user.profilePhotoUrl || user.profilePhoto || '/default-avatar.png',
        profilePublic: user.profilePublic === true,
        emailPublic:   user.emailPublic   === true,
        email:         user.emailPublic   === true ? user.email : undefined
      }
    });
  } catch (err) {
    console.error('[POST /users/profile] Error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ===== UPLOAD PROFILE PHOTO =====
// POST /api/users/profile/photo — Authenticated user uploads a new profile photo
router.post('/profile/photo', requireAuth, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // process image and upload to storage/cloud
    const url = await processAndUpload(req.file.buffer, req.file.originalname, req.file.mimetype);

    const user = await User.findByIdAndUpdate(
      req.user.uid,
      { profilePhotoUrl: url },
      { new: true, lean: true }
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, profilePhotoUrl: user.profilePhotoUrl });
  } catch (err) {
    console.error('[POST /users/profile/photo] Error:', err);
    res.status(500).json({ error: 'Photo upload failed' });
  }
});

// ===== PUBLIC PROFILE VIEW =====
// GET /api/users/:id — Return public‑view of a user’s profile, respecting privacy flags
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If profile not public and requester is not the same user, deny access
    const requesterId = req.user?.uid;
    if (!user.profilePublic && String(requesterId) !== String(user._id)) {
      return res.status(403).json({ error: 'Profile is private' });
    }

    const photoUrl = user.profilePhotoUrl || user.profilePhoto || '/default-avatar.png';

    const resp = {
      _id:           user._id,
      name:          user.name,
      displayName:   user.displayName || '',
      profilePhoto:  photoUrl,
      bio:           user.bio           || '',
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
// GET /api/users — Return minimal public info of all users whose profiles are public
router.get('/', async (req, res) => {
  try {
    const users = await User.find(
      { profilePublic: true },
      {
        _id:            1,
        name:           1,
        displayName:    1,
        profilePhotoUrl:1,
        profilePhoto:   1
      }
    ).lean();

    const list = users.map(u => ({
      _id:        u._id,
      name:       u.name,
      displayName:u.displayName || u.name,
      photoUrl:   (u.profilePhotoUrl || u.profilePhoto || '/default-avatar.png')
    }));

    res.json({ users: list });
  } catch (err) {
    console.error('[GET /users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

module.exports = router;
