import axios from 'axios';

async function testLeaderboard() {
  try {
    const response = await axios.post('https://api.hyperliquid.xyz/info', {
      type: 'leaderBoard'
    });
    
    console.log('Leaderboard API Response:');
    console.log('Total traders:', response.data.length);
    console.log('\nFirst 5 traders:');
    console.log(JSON.stringify(response.data.slice(0, 5), null, 2));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
  }
}

testLeaderboard();
