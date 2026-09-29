import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { db } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import referralRoutes from './routes/referral.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import staffRoutes from './routes/staff.routes.js';
import rewardRoutes from './routes/reward.routes.js';
import redemptionRoutes from './routes/redemption.routes.js';
import customerRoutes from './routes/customer.routes.js';
import staffAuthRoutes from './routes/staff-auth.routes.js';


dotenv.config();

const app = express();

const allowedOrigins = [
  process.env.CUSTOMER_WEB_URL,
  process.env.STORE_WEB_URL,
  process.env.CUSTOMER_LAN_URL,
  process.env.STORE_LAN_URL,
].filter(Boolean) as string[];
app.set('trust proxy', 1);
app.use(
  cors({
    origin: allowedOrigins,
  })
);

app.use(express.json());

app.use('/api/staff/auth',staffAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/redemptions', redemptionRoutes);
app.use('/api/member', customerRoutes);


app.get('/', (req, res) => {
  res.json({
    message: 'Membership API is running',
  });
});

app.get('/db-test', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT NOW() AS server_time'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Database connection failed',
    });
  }
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});