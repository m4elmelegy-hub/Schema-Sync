import { Router, type IRouter } from "express";
import { authenticate } from "../middleware/auth";
import healthRouter from "./health";
import productsRouter from "./products";
import customersRouter from "./customers";
import suppliersRouter from "./suppliers";
import salesRouter from "./sales";
import purchasesRouter from "./purchases";
import expensesRouter from "./expenses";
import incomeRouter from "./income";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import accountsRouter from "./accounts";
import returnsRouter from "./returns";
import treasuryVouchersRouter from "./treasury-vouchers";
import receiptVouchersRouter from "./receipt-vouchers";
import depositVouchersRouter from "./deposit-vouchers";
import paymentVouchersRouter from "./payment-vouchers";
import safeTransfersRouter from "./safe-transfers";
import financialTransactionsRouter from "./financial-transactions";
import adminRouter from "./admin";
import profitsRouter from "./profits";
import inventoryRouter from "./inventory";
import authRouter from "./auth";
import openingBalanceRouter from "./opening-balance";
import contactsRouter from "./contacts";

const router: IRouter = Router();

/* ── Public routes — no auth required ─────────────────────────── */
router.use(authRouter);   // /auth/users  /auth/login  /auth/me
router.use(healthRouter); // /health

/* ── Global auth guard — all routes below require valid JWT ────── */
router.use(authenticate);

/* ── Protected routes ─────────────────────────────────────────── */
router.use(productsRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(salesRouter);
router.use(purchasesRouter);
router.use(expensesRouter);
router.use(incomeRouter);
router.use(transactionsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(accountsRouter);
router.use(returnsRouter);
router.use(treasuryVouchersRouter);
router.use(receiptVouchersRouter);
router.use(depositVouchersRouter);
router.use(paymentVouchersRouter);
router.use(safeTransfersRouter);
router.use(financialTransactionsRouter);
router.use(adminRouter);
router.use(profitsRouter);
router.use(inventoryRouter);
router.use(openingBalanceRouter);
router.use(contactsRouter);

export default router;
