export const SIGNUP_BONUS_COINS = 2000;
export const GENERATION_REWARD_COINS = 10;

export class CoinTransactionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CoinTransactionError";
    this.code = code;
  }
}

export async function recordCoinTransaction(
  connection,
  {
    userId,
    amount,
    reasonType,
    reasonDescription = null,
    gibberishId = null,
    purchaseId = null,
  },
) {
  const numericAmount = Number(amount);

  if (!Number.isInteger(numericAmount) || numericAmount === 0) {
    throw new CoinTransactionError("Coin amount must be a non-zero integer", "INVALID_AMOUNT");
  }

  const [updateResult] = await connection.query(
    `UPDATE User
     SET coin_balance = coin_balance + ?
     WHERE user_id = ?
       AND coin_balance + ? >= 0`,
    [numericAmount, userId, numericAmount],
  );

  if (updateResult.affectedRows === 0) {
    throw new CoinTransactionError("Not enough coins", "INSUFFICIENT_COINS");
  }

  const [users] = await connection.query(
    "SELECT coin_balance FROM User WHERE user_id = ? LIMIT 1",
    [userId],
  );

  const balanceAfter = Number(users[0]?.coin_balance);

  await connection.query(
    `INSERT INTO CoinRecord (
       user_id,
       amount,
       balance_after,
       reason_type,
       reason_description,
       gibberish_id,
       purchase_id,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      userId,
      numericAmount,
      balanceAfter,
      reasonType,
      reasonDescription,
      gibberishId,
      purchaseId,
    ],
  );

  return {
    amount: numericAmount,
    balance_after: balanceAfter,
    reason_type: reasonType,
  };
}
