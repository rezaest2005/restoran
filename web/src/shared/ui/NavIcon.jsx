import PointOfSale from "@mui/icons-material/PointOfSale";
import Storefront from "@mui/icons-material/Storefront";
import Inventory2 from "@mui/icons-material/Inventory2";
import Factory from "@mui/icons-material/Factory";
import Label from "@mui/icons-material/Label";
import LocalShipping from "@mui/icons-material/LocalShipping";
import MenuBook from "@mui/icons-material/MenuBook";
import Stars from "@mui/icons-material/Stars";
import Feedback from "@mui/icons-material/Feedback";
import SupportAgent from "@mui/icons-material/SupportAgent";
import Language from "@mui/icons-material/Language";
import Dashboard from "@mui/icons-material/Dashboard";
import Group from "@mui/icons-material/Group";
import Extension from "@mui/icons-material/Extension";
import Home from "@mui/icons-material/Home";
import Restaurant from "@mui/icons-material/Restaurant";
import ListAlt from "@mui/icons-material/ListAlt";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import Description from "@mui/icons-material/Description";
import Kitchen from "@mui/icons-material/Kitchen";
import ConfirmationNumber from "@mui/icons-material/ConfirmationNumber";
import CardGiftcard from "@mui/icons-material/CardGiftcard";
import AccountBalance from "@mui/icons-material/AccountBalance";

/** نام نمادین → آیکن MUI (جایگزین ایموجی در منوها). */
const ICONS = {
  pos: PointOfSale, tenants: Storefront, inventory: Inventory2, production: Factory,
  dictionary: Label, delivery: LocalShipping, accounting: AccountBalance, menubook: MenuBook,
  club: Stars, feedback: Feedback, support: SupportAgent, website: Language,
  dashboard: Dashboard, users: Group, modules: Extension, home: Home,
  food: Restaurant, list: ListAlt, receipt: ReceiptLong, doc: Description,
  kitchen: Kitchen, coupon: ConfirmationNumber, gift: CardGiftcard,
};

export default function NavIcon({ name, sx, fontSize = "small" }) {
  const Cmp = ICONS[name] || Dashboard;
  return <Cmp fontSize={fontSize} sx={{ flexShrink: 0, ...sx }} aria-hidden="true" />;
}
