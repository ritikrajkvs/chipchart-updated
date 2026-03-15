import { ShoppingCart, Plus, Minus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { useBucketStore } from '@/store/bucketStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PCComponent, Laptop } from '@/lib/recommendationEngine';

export const BucketSheet = () => {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, getTotalPrice, clearBucket } = useBucketStore();

  const handleCheckout = () => {
    // In a real app, this would route to a checkout process
    // For now, we'll just alert and clear the bucket since the user asked for functional buy links directly on components
    alert("Checkout functionality would go here! Redirecting you to buy links...");
  };

  const getAmazonSearchUrl = (productName: string) => {
    return `https://www.amazon.in/s?k=${encodeURIComponent(productName)}`;
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent aria-describedby={undefined} className="w-full sm:max-w-md flex flex-col bg-background/95 backdrop-blur-md border-border p-0">
        <SheetHeader className="p-6 border-b border-border">
          <SheetTitle className="flex items-center gap-2 font-heading text-xl">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Your Build Bucket
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-muted-foreground mt-20">
              <ShoppingCart className="h-12 w-12 opacity-20" />
              <p>Your bucket is completely empty.</p>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Continue Browsing</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 p-3 rounded-lg border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <h4 className="font-semibold text-sm line-clamp-2 pr-2 leading-tight">{item.name}</h4>
                      <button onClick={() => removeItem(item.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors mt-0.5 shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5 capitalize">
                      {item.type}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <p className="font-bold text-accent text-sm">₹{(item.price * item.quantity).toLocaleString()}</p>
                      <div className="flex items-center gap-2 border border-border rounded-md px-1 py-0.5 bg-secondary/50">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="p-1 hover:text-accent disabled:opacity-50">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-medium w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 hover:text-accent">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Direct Buy Link for the item */}
                    <a 
                      href={getAmazonSearchUrl(item.name)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline mt-2 pt-2 border-t border-border w-full"
                    >
                      Search on Amazon <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {items.length > 0 && (
          <SheetFooter className="p-6 border-t border-border bg-card">
            <div className="w-full space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-bold">₹{getTotalPrice().toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={clearBucket} className="flex-1">
                  Clear
                </Button>
                <Button variant="accent" onClick={handleCheckout} className="flex-1 bg-accent hover:bg-accent/90">
                  <ShoppingCart className="h-4 w-4 mr-2" /> Checkout
                </Button>
              </div>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
