import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Dashboard() {
  const [user, setUser] = useState(null)
  const [balance, setBalance] = useState(10000)
  const [portfolio, setPortfolio] = useState([])
  const [prices, setPrices] = useState([])
  const [selectedCrypto, setSelectedCrypto] = useState('BTC')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [trades, setTrades] = useState([])
  const [activeTab, setActiveTab] = useState('market')
  const navigate = useNavigate()

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    } else {
      navigate('/login')
    }
    fetchMarketData()
  }, [])

  const fetchMarketData = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/market/prices`)
      setPrices(response.data.prices || [])
    } catch (err) {
      console.error('Failed to fetch market data')
    }
  }

  const handleBuy = async () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setMessage('❌ Please enter a valid amount')
      return
    }

    setLoading(true)
    try {
      const crypto = prices.find(p => p.symbol === selectedCrypto)
      const totalCost = parseFloat(amount) * crypto.price

      if (totalCost > balance) {
        setMessage('❌ Insufficient balance')
        setLoading(false)
        return
      }

      await axios.post(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/trading/buy`,
        {
          symbol: selectedCrypto,
          amount,
          price: crypto.price,
          userId: user.id
        }
      )

      setBalance(balance - totalCost)
      setAmount('')
      setMessage(`✅ Successfully bought ${amount} ${selectedCrypto}!`)
      setTimeout(() => setMessage(''), 3000)
      fetchPortfolio()
    } catch (err) {
      setMessage(err.response?.data?.error || '❌ Buy order failed')
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolio = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/portfolio/${user.id}`
      )
      setPortfolio(response.data.portfolio || [])
      setBalance(response.data.balance || 10000)
    } catch (err) {
      console.error('Failed to fetch portfolio')
    }
  }

  const handleSell = async (crypto) => {
    const sellAmount = prompt(`Enter amount to sell (max: ${crypto.amount})`)
    if (!sellAmount || parseFloat(sellAmount) <= 0) return

    setLoading(true)
    try {
      const cryptoPrice = prices.find(p => p.symbol === crypto.crypto_symbol)?.price || crypto.purchase_price
      
      await axios.post(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/trading/sell`,
        {
          symbol: crypto.crypto_symbol,
          amount: sellAmount,
          price: cryptoPrice,
          userId: user.id
        }
      )

      setMessage(`✅ Successfully sold ${sellAmount} ${crypto.crypto_symbol}!`)
      setTimeout(() => setMessage(''), 3000)
      fetchPortfolio()
    } catch (err) {
      setMessage(err.response?.data?.error || '❌ Sell order failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const currentCrypto = prices.find(p => p.symbol === selectedCrypto)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Navbar */}
      <nav className="bg-slate-800/80 backdrop-blur border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold text-blue-400">📈 Trading App</h1>
          <div className="flex items-center gap-4">
            <span className="text-green-400 font-semibold">${balance.toFixed(2)}</span>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold transition"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Message Alert */}
        {message && (
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('market')}
            className={`px-4 py-2 font-semibold ${activeTab === 'market' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
          >
            Market
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-2 font-semibold ${activeTab === 'portfolio' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}
          >
            Portfolio
          </button>
        </div>

        {/* Market Tab */}
        {activeTab === 'market' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Market Prices */}
            <div className="lg:col-span-2 bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-xl font-bold mb-4">💰 Market Prices</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-700">
                    <tr>
                      <th className="text-left py-3">Symbol</th>
                      <th className="text-left py-3">Name</th>
                      <th className="text-right py-3">Price</th>
                      <th className="text-right py-3">24h Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map((price) => (
                      <tr
                        key={price.symbol}
                        onClick={() => setSelectedCrypto(price.symbol)}
                        className="border-b border-slate-700 hover:bg-slate-700/50 cursor-pointer transition"
                      >
                        <td className="py-3 font-bold">{price.symbol}</td>
                        <td className="py-3">{price.name}</td>
                        <td className="text-right py-3 text-green-400">${price.price.toLocaleString()}</td>
                        <td className={`text-right py-3 ${price.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {price.change >= 0 ? '+' : ''}{price.change}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Buy Form */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 h-fit">
              <h3 className="text-xl font-bold mb-4">🛒 Buy {selectedCrypto}</h3>

              {currentCrypto && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-700 rounded-lg">
                    <p className="text-gray-400 text-sm">Current Price</p>
                    <p className="text-2xl font-bold text-green-400">${currentCrypto.price.toLocaleString()}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Amount ({selectedCrypto})
                    </label>
                    <input
                      type="number"
                      className="w-full px-4 py-3 rounded-lg bg-slate-700 text-white border border-slate-600 focus:border-blue-500 focus:outline-none"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      step="0.0001"
                    />
                  </div>

                  {amount && currentCrypto && (
                    <div className="p-3 bg-slate-700 rounded-lg">
                      <p className="text-gray-400 text-sm">Total Cost</p>
                      <p className="text-2xl font-bold text-yellow-400">
                        ${(parseFloat(amount) * currentCrypto.price).toFixed(2)}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleBuy}
                    disabled={loading || !amount}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : '✓ Buy Now'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-4">📊 Your Portfolio</h3>
            {portfolio.length === 0 ? (
              <p className="text-gray-400">No holdings yet. Start trading!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {portfolio.map((holding) => (
                  <div key={holding.id} className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-lg font-bold text-blue-400">{holding.crypto_symbol}</p>
                        <p className="text-sm text-gray-400">Amount: {holding.amount}</p>
                      </div>
                      <button
                        onClick={() => handleSell(holding)}
                        className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm font-semibold"
                      >
                        Sell
                      </button>
                    </div>
                    <p className="text-sm text-gray-300">Purchase Price: ${holding.purchase_price}</p>
                    <p className="text-green-400 font-semibold mt-2">
                      Value: ${(holding.amount * holding.purchase_price).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
