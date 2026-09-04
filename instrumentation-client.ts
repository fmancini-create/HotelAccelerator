function mountAnna4Bid() {
  if (document.querySelector('script[data-anna-4bid="hotelaccelerator"]')) return
  const script = document.createElement("script")
  script.src = "https://hotelaccelerator.com/anna-chat.js"
  script.defer = true
  script.dataset.anna4bid = "hotelaccelerator"
  script.dataset.publicKey = "wk_ad8bd17c111f45d4851aab309ec858cdc551"
  script.dataset.product = "HotelAccelerator"
  script.dataset.hideOn = "/admin,/super-admin,/api"
  document.body.appendChild(script)
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAnna4Bid, { once: true })
else mountAnna4Bid()
