import express, { Express } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { addReading, getReading } from './database';

dotenv.config();

const PORT = process.env.PORT || 3000;
const app: Express = express();

// Predefined list of allowed metric names
const ALLOWED_METRICS = ['Voltage', 'Current'];

app.use(helmet());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

app.post('/data', async (req, res) => {
  try {
    const rawData = req.body;
    
    // Split the incoming data by lines
    const lines = rawData.split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(' ');

      // Ensure the format is correct
      if (parts.length !== 3) {
        return res.status(400).json({ success: false, message: 'Malformed data' });
      }

      const [timestampStr, name, valueStr] = parts;   

      const value = parseFloat(valueStr);
      const timestamp = parseInt(timestampStr, 10);

      // Validate name is in predefined list
      if (!ALLOWED_METRICS.includes(name)) {
        return res.status(400).json({ success: false, message: `Invalid metric name: ${name}` });
      }      

      if (isNaN(value)) {
        return res.status(400).json({ success: false, message: `Invalid value data format: ${value}` });
      }     
    
      // Create a date object directly from the timestamp
      const date = new Date(timestamp);
    
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return res.status(400).json({ success: false, message: `Invalid timestamp date: ${timestamp}` });
      }
    }

    // Only add them into the db if all data is valid
    for (const line of lines) {
      const parts = line.trim().split(' ');
      
      const [timestampStr, name, valueStr] = parts;   

      const value = parseFloat(valueStr);
      const timestamp = parseInt(timestampStr, 10);

      // Save the data to the database   
      await addReading(timestamp, name, value);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/data', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ success: false, message: 'from and to query parameters are required' });
  }

  try {
    // Convert ISO date string to Unix timestamp
    const fromTimestamp = new Date(from as string).getTime() / 1000;
    const toTimestamp = new Date(to as string).getTime() / 1000;

    if (isNaN(fromTimestamp) || isNaN(toTimestamp)) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }

    // Retrieve data from the database
    const readings = await getReading(fromTimestamp, toTimestamp);

    if (readings.length === 0) {
      return res.json([]);
    }    

    // Group readings by day
    const groupedByDay: { [key: string]: { Voltage: number[], Current: number[] } } = {};
    
    readings.forEach((reading) => {
      const dateKey = new Date(reading.timestamp * 1000).toISOString().split('T')[0];
      
      if (!groupedByDay[dateKey]) {
        groupedByDay[dateKey] = { Voltage: [], Current: [] };
      }

      if (reading.metric_name === 'Voltage') {
        groupedByDay[dateKey].Voltage.push(reading.metric_value);
      } else if (reading.metric_name === 'Current') {
        groupedByDay[dateKey].Current.push(reading.metric_value);
      }
    });

    // Prepare response with average Power calculations
    const responseData: any[] = [];

    Object.entries(groupedByDay).forEach(([date, metrics]) => {
      const avgVoltage = metrics.Voltage.reduce((a, b) => a + b, 0) / metrics.Voltage.length || 0;
      const avgCurrent = metrics.Current.reduce((a, b) => a + b, 0) / metrics.Current.length || 0;
      const avgPower = avgVoltage * avgCurrent;

      // Add individual readings
      readings.forEach((reading) => {
        if (new Date(reading.timestamp * 1000).toISOString().split('T')[0] === date) {
          responseData.push({
            time: new Date(reading.timestamp * 1000).toISOString(),
            name: reading.metric_name,
            value: reading.metric_value,
          });
        }
      });

      // Add the average Power for the day
      responseData.push({
        time: `${date}T00:00:00.000Z`,
        name: 'Power',
        value: avgPower,
      });
    });

    return res.json(responseData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Running on port ${PORT} ⚡`));
