const pool = require("../db/db")

/* ================= GET INVENTORY ================= */

exports.getInventory = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT item_id,
             item_name,
             category,
             buy_price,
             sell_price,
             stock_quantity,
             status
      FROM inventory
      WHERE status != 'Deleted'
      ORDER BY item_name
    `)


  
    res.json(result.rows)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


/* ================= ADD PRODUCT ================= */

exports.addProduct = async (req, res) => {
  try {

    const { item_name, category, buy_price, sell_price, stock_quantity } = req.body

    const result = await pool.query(`
      INSERT INTO inventory
      (item_name,category,buy_price,sell_price,stock_quantity,status)
      VALUES ($1,$2,$3,$4,$5,'Available')
      RETURNING *
    `,
    [item_name, category, buy_price, sell_price, stock_quantity])

    res.json(result.rows[0])

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


/* ================= DELETE (SOFT DELETE) ================= */

exports.deleteItem = async (req, res) => {
  try {

    const id = parseInt(req.params.id);

    await pool.query(`
  UPDATE inventory
  SET status = 'Deleted'
  WHERE item_id = $1
`, [id]);

    res.json({ message: "Deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/* ================= UPDATE ================= */

exports.updateItem = async (req, res) => {
  try {

    const { id } = req.params;
    const { item_name, category, buy_price, sell_price, stock_quantity } = req.body;

    const result = await pool.query(`
      UPDATE inventory
      SET item_name=$1,
          category=$2,
          buy_price=$3,
          sell_price=$4,
          stock_quantity=$5
      WHERE item_id=$6
      RETURNING *
    `, [item_name, category, buy_price, sell_price, stock_quantity, id]);

    if(result.rowCount === 0){
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }
};


/* ================= LOW STOCK ================= */

exports.getLowStock = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT item_id,item_name,stock_quantity
      FROM inventory
      WHERE stock_quantity <= 5
      AND status != 'Deleted'
      ORDER BY stock_quantity ASC
    `)

    res.json(result.rows)

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}