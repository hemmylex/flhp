// config/db.js
import axios from "axios";

const pool = {
  query: async (text, params = []) => {
    try {
      const response = await axios.post(
        "https://query.fololaundrypro.com.ng/query.php",
        {
          sql: text,
          values: params,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.BRIDGE_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000, // 15 seconds timeout
        }
      );

      return {
        rows: response.data.rows || [],
        rowCount: response.data.rowCount || 0,
      };
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error(`Bridge failure: ${error.message}`);
    }
  },
};

export default pool;
