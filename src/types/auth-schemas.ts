import * as v from 'valibot'

// Auth input contract — imported by the login/signup pages for field
// validation and by the server functions as `.validator()`, so client and
// server always validate against the same rules.
export const SigninSchema = v.object({
  email: v.pipe(v.string(), v.email('Enter a valid email')),
  password: v.pipe(v.string(), v.minLength(1, 'Password is required')),
})

export const SignupSchema = v.object({
  email: v.pipe(v.string(), v.email('Enter a valid email')),
  password: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters')),
})
