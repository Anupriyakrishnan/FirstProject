const passport = require('passport');
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();


passport.use(new GoogleStrategy({
    clientID:process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:'/auth/google/callback'
},

    async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if a user with the same googleId exists
    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      // If no user with this googleId, check by email
      user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Attach the googleId if email match found
        user.googleId = profile.id;
        await user.save();
      } else {
        // Create new user if no match found
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          isBlocked: false,
          provider: 'google',
        });
        await user.save();
      }
    }

    if (user.isBlocked) {
      return done(null, false, { message: "User is blocked by admin" });
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}


))


passport.serializeUser((user,done)=>{

    done(null,user.id)

});

passport.deserializeUser(async(id,done)=>{
   try {
    const user = await User.findById(id);
    done (null,user)
   } catch (error) {
    done(err,null)
   }
})


module.exports = passport;
