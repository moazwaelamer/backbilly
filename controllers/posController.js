const pool = require("../db/db");


// ================= CREATE SALE =================

exports.createSale = async (req, res) => {

  const { session_id, payment_method, items } = req.body;

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    // التأكد من وجود شيفت مفتوح

    const shift = await client.query(`
      SELECT shift_id
      FROM shifts
      WHERE status='Active'
      LIMIT 1
    `);

    if (shift.rows.length === 0) {
      throw new Error("No active shift running");
    }

    const shiftId = shift.rows[0].shift_id;

    let total = 0;

    // حساب السعر الإجمالي والتأكد من المخزون

    for (const item of items) {

      const product = await client.query(
        "SELECT sell_price, stock_quantity FROM inventory WHERE item_id=$1",
        [item.item_id]
      );

      if (product.rows.length === 0) {
        throw new Error("Item not found");
      }

      const price = product.rows[0].sell_price;
      const stock = product.rows[0].stock_quantity;

      if (stock < item.quantity) {
        throw new Error("Not enough stock");
      }

      total += price * item.quantity;

    }

    // إنشاء الفاتورة

    const sale = await client.query(
      `INSERT INTO cafe_sales(session_id,shift_id,total_amount,payment_method)
       VALUES($1,$2,$3,$4)
       RETURNING sale_id`,
      [
        session_id || null,
        shiftId,
        total,
        payment_method
      ]
    );

    const saleId = sale.rows[0].sale_id;

    // إدخال المنتجات وتحديث المخزون

    for (const item of items) {

      const product = await client.query(
        "SELECT sell_price FROM inventory WHERE item_id=$1",
        [item.item_id]
      );

      const price = product.rows[0].sell_price;
      const subtotal = price * item.quantity;

      await client.query(
        `INSERT INTO cafe_sale_items
        (sale_id,item_id,quantity,price,subtotal)
        VALUES($1,$2,$3,$4,$5)`,
        [saleId, item.item_id, item.quantity, price, subtotal]
      );

      await client.query(
        `UPDATE inventory
         SET stock_quantity = stock_quantity - $1
         WHERE item_id=$2`,
        [item.quantity, item.item_id]
      );

    }

    // تحديث الشيفت

    await client.query(`
      UPDATE shifts
      SET snacks_revenue = snacks_revenue + $1,
          total_revenue = total_revenue + $1
      WHERE shift_id = $2
    `, [total, shiftId]);

    await client.query("COMMIT");

    res.json({
      message: "Sale completed",
      sale_id: saleId,
      total
    });

  } catch (err) {

    await client.query("ROLLBACK");

    res.status(500).json({
      error: err.message
    });

  } finally {

    client.release();

  }

};


// ================= MENU =================

exports.getMenu = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT item_id, item_name, category, sell_price, stock_quantity
      FROM inventory
      WHERE status = 'Available'
      ORDER BY category
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

};


// ================= LOW STOCK ALERT =================

exports.getLowStock = async (req,res)=>{

  try{

    const result = await pool.query(`
      SELECT item_id,item_name,stock_quantity
      FROM inventory
      WHERE stock_quantity <= 5
      ORDER BY stock_quantity ASC
    `);

    res.json(result.rows);

  }catch(err){

    res.status(500).json({
      error:err.message
    });

  }

};


// ================= ALL SALES =================

exports.getSales = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT sale_id,total_amount,payment_method,created_at
      FROM cafe_sales
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

};


// ================= SALE DETAILS =================

exports.getSaleById = async (req, res) => {

  const { id } = req.params;

  try {

    const sale = await pool.query(
      `SELECT * FROM cafe_sales WHERE sale_id=$1`,
      [id]
    );

    const items = await pool.query(`
      SELECT i.item_name,s.quantity,s.price,s.subtotal
      FROM cafe_sale_items s
      JOIN inventory i ON i.item_id = s.item_id
      WHERE sale_id=$1
    `,[id]);

    res.json({
      sale: sale.rows[0],
      items: items.rows
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

};


// ================= TODAY SALES =================

exports.getTodaySales = async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT sale_id,total_amount,payment_method,created_at
      FROM cafe_sales
      WHERE DATE(created_at)=CURRENT_DATE
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

};