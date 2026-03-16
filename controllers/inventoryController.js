const pool = require("../db/db")

exports.getInventory = async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT item_id,
              item_name,
              category,
              buy_price,
              sell_price,
              stock_quantity,
              status
       FROM inventory
       ORDER BY item_name`
    )

    res.json(result.rows)

  } catch (err) {

   res.json([])

  }
}
exports.getLowStock = async(req,res)=>{

  try{

    const result = await pool.query(`
      SELECT item_id,item_name,stock_quantity
      FROM inventory
      WHERE stock_quantity <= 5
      AND status='Available'
      ORDER BY stock_quantity ASC
    `)

    res.json(result.rows)

  }catch(err){

    res.status(500).json({
      error:err.message
    })

  }

}