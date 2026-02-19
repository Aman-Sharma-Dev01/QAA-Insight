import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const sheetSchema = new mongoose.Schema({
  sheetId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  displayName: {
    type: String,
    trim: true,
    default: function() {
      return this.username;
    }
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  sheets: [sheetSchema],
  // Merged names mapping stored as JSON: { "sheetId": { "category": { "canonicalName": ["variant1", "variant2"] } } }
  mergedNames: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  settings: {
    defaultSheetId: {
      type: String,
      default: null
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    }
  },
  lastLogin: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get user profile without sensitive data
userSchema.methods.toProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    displayName: this.displayName,
    role: this.role,
    sheets: this.sheets,
    mergedNames: this.mergedNames || {},
    settings: this.settings,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt
  };
};

const User = mongoose.model('User', userSchema);

export default User;
