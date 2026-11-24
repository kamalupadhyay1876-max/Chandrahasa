# Chandrahasa — 200 UX, commerce and platform components

> Inventory and implementation map. This list is not a claim that all 200 are complete. Existing source foundations and work requiring provider, owner or engineering implementation must be distinguished. No fake catalogue data should be used.

## Discovery & navigation
001. Brand masthead
002. Desktop category navigation
003. Mobile navigation
004. Mobile bottom tabs
005. Search overlay
006. Debounced search suggestions
007. Enter-to-search
008. Search product names
009. Search descriptions
010. Search HUID
011. Search categories
012. Search result count
013. Search empty state
014. Search error state
015. Recent searches
016. Popular suggestions
017. Typo-tolerant search
018. Synonym search
019. Voice search
020. Visual search

## Catalogue & merchandising
021. Live category API
022. Live product API
023. Escaped product cards
024. Real product imagery
025. Stock-aware add to bag
026. Product price
027. Compare-at price
028. Real ratings only
029. Real review counts only
030. HUID only when supplied
031. Category filter
032. Minimum price filter
033. Maximum price filter
034. Price range chips
035. In-stock filter
036. Sale filter
037. Newest sort
038. Popularity sort
039. Rating sort
040. Price sort

## Product detail
041. Product route by slug
042. Product image gallery
043. Catalogue description
044. Material/purity details
045. Weight when supplied
046. HUID when supplied
047. Live stock status
048. Variant selection
049. Quantity selector
050. Add to bag
051. Wishlist action
052. Related products API
053. Real review list
054. Verified buyer review gate
055. Review submission
056. Review aggregate
057. Share product
058. Care information
059. Delivery estimate
060. Recently viewed

## Cart & checkout
061. Guest cart persistence
062. Server-side member cart
063. Guest cart merge
064. Increment quantity
065. Decrement quantity
066. Remove cart item
067. Subtotal calculation
068. Shipping calculation
069. Coupon validation
070. Server-side price calculation
071. Server-side stock validation
072. Address form
073. Guest checkout
074. Razorpay order creation
075. Razorpay signature verification
076. Webhook signature verification
077. Payment idempotency
078. COD order placement
079. Order confirmation
080. Duplicate submit prevention

## Customer account
081. Sign-in
082. Registration
083. Password reset request
084. Password reset completion
085. HttpOnly session cookie
086. Sign-out
087. Profile view
088. Profile edit
089. Saved addresses
090. Default address
091. Wishlist API
092. Wishlist page
093. Order history
094. Order detail
095. Order timeline
096. Invoice/receipt download
097. Tokenized payment methods
098. Session expiry handling
099. Change password
100. Privacy deletion request

## Orders, delivery & returns
101. Order persistence
102. Order item snapshot
103. Payment status
104. COD status
105. Owner-only order access
106. Shipment creation
107. Shipment tracking
108. Courier assignment
109. AWB display
110. Shipping label
111. Delivery timeline
112. Delivery email
113. Delivery SMS
114. Cancellation eligibility
115. Cancellation request
116. Return eligibility
117. Return request
118. Reverse pickup
119. Refund status
120. Refund reconciliation

## Trust & assurance
121. Accurate purity labels
122. No fabricated ratings
123. No fabricated reviews
124. No fabricated HUID
125. No invented testimonials
126. Specification table
127. Image alt text
128. Shipping fee transparency
129. Discount transparency
130. Returns policy
131. Privacy policy
132. Terms page
133. Support contact
134. Verified review authoring
135. Review moderation
136. Review reporting
137. BIS details when verified
138. Certificate download
139. Authenticity support
140. Product Q&A

## Support & retention
141. Contact page
142. Contact form validation
143. Newsletter validation
144. Newsletter delivery
145. Verified support details
146. FAQ accordion
147. Order help
148. Shipping help
149. Returns help
150. Sizing guide
151. Silver care guide
152. Store locator
153. WhatsApp support
154. Email support
155. Support tickets
156. Ticket status
157. Abandoned cart email
158. Back-in-stock alerts
159. Price-drop alerts
160. Loyalty ledger

## Admin & operations
161. Admin sign-in
162. Admin role authorization
163. Live dashboard metrics
164. Database product list
165. Admin product search
166. Create product
167. Edit product
168. Archive product
169. Category management
170. Inventory adjustments
171. Low-stock view
172. Order management
173. Order status update
174. Refund action
175. Coupon management
176. Customer lookup
177. Review moderation
178. Shipment operations
179. Audit log
180. Admin MFA/passkeys

## Security & performance
181. Vercel static deployment
182. Same-origin API proxy
183. Backend URL environment contract
184. Request body cap
185. API path traversal guard
186. CSRF token flow
187. CSRF server validation
188. Origin validation
189. Security headers
190. HttpOnly sessions
191. scrypt password hashing
192. Hashed reset tokens
193. Auth rate limiting
194. Input length validation
195. Parameterized SQL
196. HTML escaping
197. No client payment secrets
198. No mock catalogue fallback
199. Local variable fonts
200. Lazy image loading
